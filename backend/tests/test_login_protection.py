"""Login protection: failed logins are slowed down; two-factor login."""
import time

import pytest

from app import two_factor
from app.routers import auth as auth_router


@pytest.fixture(autouse=True)
def behind_proxy(monkeypatch):
    """The test client stands in for the local Nginx: X-Real-IP counts."""
    monkeypatch.setattr(auth_router, "TRUSTED_PROXIES", {"testclient"})


def login(client, username, password="Secret-pass-1", otp=None, ip=None):
    data = {"username": username, "password": password}
    if otp is not None:
        data["otp"] = otp
    return client.post("/api/v1/auth/login", data=data, headers={"X-Real-IP": ip} if ip else {})


def test_totp_matches_the_rfc_6238_test_vector():
    secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"  # "12345678901234567890"
    assert two_factor.code_at(secret, 59 // 30, digits=8) == "94287082"
    assert two_factor.code_at(secret, 1111111109 // 30, digits=8) == "07081804"
    now = 1111111109
    code = two_factor.code_at(secret, now // 30)
    assert two_factor.matching_step(secret, code, now=now) == now // 30
    assert two_factor.matching_step(secret, code[:3] + " " + code[3:], now=now + 30) == now // 30  # a step late is fine
    assert two_factor.matching_step(secret, code, now=now + 90) is None
    assert two_factor.matching_step(secret, "abcdef", now=now) is None


def test_failed_logins_are_refused_for_a_while(client, alice, bob):
    for _ in range(auth_router.MAX_FAILURES_PER_ACCOUNT):
        assert login(client, "alice", "wrong").status_code == 401
    r = login(client, "alice")  # right password, but too many failures
    assert r.status_code == 429 and r.headers["retry-after"]
    assert login(client, "Alice").status_code == 429  # any spelling
    assert login(client, "bob").status_code == 200  # others aren't affected

    # the lock is per address: alice can still log in from elsewhere
    assert login(client, "alice", ip="10.0.0.9").status_code == 200

    # it lifts after the window
    from app.database import SessionLocal
    from app.models import LoginFailure
    with SessionLocal() as db:
        db.query(LoginFailure).update({LoginFailure.at: LoginFailure.at - auth_router.LOCK_WINDOW})
        db.commit()
    assert login(client, "alice").status_code == 200


def test_many_accounts_from_one_address(client, admin):
    for i in range(auth_router.MAX_FAILURES_PER_ADDRESS):
        assert login(client, f"guess{i}", "x", ip="10.1.1.1").status_code == 401
    assert login(client, "admin", ip="10.1.1.1").status_code == 429
    assert login(client, "admin", ip="10.1.1.2").status_code == 200


def test_two_factor_setup_login_and_recovery(client, alice, admin):
    h = alice.headers
    assert client.get("/api/v1/auth/2fa", headers=h).json() == {"enabled": False, "recovery_left": 0}
    setup = client.post("/api/v1/auth/2fa/setup", headers=h).json()
    assert setup["uri"].startswith("otpauth://totp/Project%20Manager%3Aalice?secret=" + setup["secret"])
    assert setup["qr_svg"].startswith("<svg")
    assert login(client, "alice").status_code == 200  # not on until confirmed

    assert client.post("/api/v1/auth/2fa/enable", json={"code": "000000"}, headers=h).status_code == 400
    now = time.time()
    code = two_factor.code_at(setup["secret"], int(now // 30))
    r = client.post("/api/v1/auth/2fa/enable", json={"code": code}, headers=h)
    assert r.status_code == 200
    recovery = r.json()["recovery_codes"]
    assert len(recovery) == 10 and len(set(recovery)) == 10
    assert client.get("/api/v1/auth/me", headers=h).json()["two_factor"] is True
    assert "two_factor" not in client.get("/api/v1/users/", headers=h).json()[0]  # not shown to others

    # the password alone isn't enough any more
    r = login(client, "alice")
    assert r.status_code == 401 and r.json()["detail"] == auth_router.TWO_FACTOR_REQUIRED
    assert login(client, "alice", otp="123456").status_code == 401
    # the code used for setup can't be used again; the next one can
    assert login(client, "alice", otp=code).status_code == 401
    nxt = two_factor.code_at(setup["secret"], int(now // 30) + 1)
    assert login(client, "alice", otp=nxt).status_code == 200
    # a recovery code works once, written any way
    assert login(client, "alice", otp=recovery[0].upper().replace("-", " ")).status_code == 200
    assert login(client, "alice", otp=recovery[0]).status_code == 401
    assert client.get("/api/v1/auth/2fa", headers=h).json() == {"enabled": True, "recovery_left": 9}

    # new recovery codes need the password; API tokens can't change any of it
    assert client.post("/api/v1/auth/2fa/recovery-codes", json={"password": "nope"}, headers=h).status_code == 400
    fresh = client.post("/api/v1/auth/2fa/recovery-codes", json={"password": "Secret-pass-1"}, headers=h).json()["recovery_codes"]
    assert login(client, "alice", otp=recovery[1]).status_code == 401
    assert login(client, "alice", otp=fresh[0]).status_code == 200
    token = client.post("/api/v1/auth/tokens/", json={"name": "script"}, headers=h).json()["token"]
    th = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/tasks/", headers=th).status_code == 200  # tokens keep working
    assert client.post("/api/v1/auth/2fa/disable", json={"password": "Secret-pass-1"}, headers=th).status_code == 403

    # an admin can switch it off for someone who lost everything
    assert client.delete(f"/api/v1/users/{alice.id}/two-factor", headers=alice.headers).status_code == 403
    listed = {u["username"]: u for u in client.get("/api/v1/users/admin/all", headers=admin.headers).json()}
    assert listed["alice"]["two_factor"] is True
    assert client.delete(f"/api/v1/users/{alice.id}/two-factor", headers=admin.headers).status_code == 200
    assert login(client, "alice").status_code == 200


def test_switching_two_factor_off(client, alice):
    secret = client.post("/api/v1/auth/2fa/setup", headers=alice.headers).json()["secret"]
    code = two_factor.code_at(secret, int(time.time() // 30))
    client.post("/api/v1/auth/2fa/enable", json={"code": code}, headers=alice.headers)
    assert client.post("/api/v1/auth/2fa/setup", headers=alice.headers).status_code == 400  # already on
    assert client.post("/api/v1/auth/2fa/disable", json={"password": "wrong"}, headers=alice.headers).status_code == 400
    assert client.post("/api/v1/auth/2fa/disable", json={"password": "Secret-pass-1"}, headers=alice.headers).status_code == 200
    assert login(client, "alice").status_code == 200
