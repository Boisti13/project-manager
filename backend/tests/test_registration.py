from conftest import User


def register(client, name, password="Secret-pass-1", email=None):
    return client.post("/api/auth/register", json={
        "username": name, "email": email or f"{name}@example.com", "password": password,
    })


def test_first_account_can_always_register(client):
    assert client.get("/api/auth/registration").json() == {"open": True}
    r = register(client, "first")
    assert r.status_code == 200 and r.json()["is_admin"] is True


def test_closed_once_an_admin_exists(client, admin):
    assert client.get("/api/auth/registration").json() == {"open": False}
    r = register(client, "stranger")
    assert r.status_code == 403
    assert "closed" in r.json()["detail"]


def test_admin_can_open_and_close_registration(client, admin):
    client.put("/api/settings/", json={"allow_registration": True}, headers=admin.headers)
    assert client.get("/api/auth/registration").json() == {"open": True}
    r = register(client, "newbie")
    assert r.status_code == 200 and r.json()["is_admin"] is False
    client.put("/api/settings/", json={"allow_registration": False}, headers=admin.headers)
    assert register(client, "latecomer").status_code == 403


def test_only_admins_toggle_registration(client, admin, alice):
    r = client.put("/api/settings/", json={"allow_registration": True}, headers=alice.headers)
    assert r.status_code == 403


def test_new_account_rules(client):
    assert register(client, "short", password="1234567").status_code == 422   # < 8 chars
    assert register(client, "has space").status_code == 422
    assert register(client, "x", email="not-an-email").status_code == 422
    assert register(client, "ok-name").status_code == 200


def test_admin_creates_users(client, admin, alice):
    r = client.post("/api/users/", json={"username": "carol", "email": "carol@example.com",
                                         "password": "Carol-pass-1", "is_admin": True}, headers=admin.headers)
    assert r.status_code == 200 and r.json()["is_admin"] is True
    # can log in right away
    assert client.post("/api/auth/login", data={"username": "carol", "password": "Carol-pass-1"}).status_code == 200
    # duplicates and non-admins are refused
    dup = {"username": "carol", "email": "other@example.com", "password": "x" * 8}
    assert client.post("/api/users/", json=dup, headers=admin.headers).status_code == 400
    new = {"username": "dave", "email": "dave@example.com", "password": "x" * 8}
    assert client.post("/api/users/", json=new, headers=alice.headers).status_code == 403


def test_admin_sets_password(client, admin, alice):
    r = client.put(f"/api/users/{alice.id}/password", json={"password": "Brand-new-1"}, headers=admin.headers)
    assert r.status_code == 200
    assert client.post("/api/auth/login", data={"username": "alice", "password": alice.password}).status_code == 401
    assert client.post("/api/auth/login", data={"username": "alice", "password": "Brand-new-1"}).status_code == 200
    assert client.put(f"/api/users/{alice.id}/password", json={"password": "short"}, headers=admin.headers).status_code == 422
    assert client.put("/api/users/9999/password", json={"password": "x" * 8}, headers=admin.headers).status_code == 404
    bob = User(client, "bob", created_by=admin)
    assert client.put(f"/api/users/{alice.id}/password", json={"password": "x" * 8}, headers=bob.headers).status_code == 403


def test_change_own_password(client, alice):
    url = "/api/auth/change-password"
    wrong = client.post(url, json={"current_password": "nope", "new_password": "Another-pass-1"}, headers=alice.headers)
    assert wrong.status_code == 400
    short = client.post(url, json={"current_password": alice.password, "new_password": "short"}, headers=alice.headers)
    assert short.status_code == 422
    ok = client.post(url, json={"current_password": alice.password, "new_password": "Another-pass-1"}, headers=alice.headers)
    assert ok.status_code == 200
    assert client.post("/api/auth/login", data={"username": "alice", "password": "Another-pass-1"}).status_code == 200
    assert client.post(url, json={"current_password": "x", "new_password": "y" * 8}).status_code == 401


def test_existing_short_passwords_still_work(client, admin):
    """The 8-character rule is for new passwords; old accounts keep logging in."""
    from app.auth import get_password_hash
    from app.database import SessionLocal
    from app.models import User as UserModel

    s = SessionLocal()
    s.add(UserModel(username="legacy user", email="legacy@example.com", hashed_password=get_password_hash("1234"),
                    is_active=True, is_admin=False))
    s.commit()
    s.close()
    tok = client.post("/api/auth/login", data={"username": "legacy user", "password": "1234"})
    assert tok.status_code == 200
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok.json()['access_token']}"})
    assert me.json()["username"] == "legacy user"  # names that break the new rules still load
