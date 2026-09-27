from datetime import timedelta

from sqlalchemy import text


def create(client, user, **data):
    r = client.post("/api/v1/auth/tokens/", json={"name": "script", **data}, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def sql(query, **params):
    from app.database import engine

    with engine.begin() as c:
        return c.execute(text(query), params)


def test_create_use_list_revoke(client, alice, bob):
    t = create(client, alice, name="  Windows   laptop ")
    assert t["token"].startswith("pm_") and len(t["token"]) > 40
    assert t["prefix"] == t["token"][:11] and t["name"] == "Windows laptop" and t["expires_at"] is None
    # works like a login, on /api/v1 and /api
    me = client.get("/api/v1/auth/me", headers=bearer(t["token"])).json()
    assert me["username"] == "alice"
    assert client.post("/api/tasks/", json={"title": "via token"}, headers=bearer(t["token"])).status_code == 200
    # the list never shows the token itself, only its prefix; last use is recorded
    listed = client.get("/api/v1/auth/tokens/", headers=alice.headers).json()
    assert [(x["name"], x["prefix"], "token" in x) for x in listed] == [("Windows laptop", t["prefix"], False)]
    assert listed[0]["last_used_at"] is not None
    # only the hash is stored
    assert sql("SELECT count(*) FROM api_tokens WHERE token_hash = :t", t=t["token"]).scalar() == 0
    # other users can't see or revoke it
    assert client.get("/api/v1/auth/tokens/", headers=bob.headers).json() == []
    assert client.delete(f"/api/v1/auth/tokens/{t['id']}", headers=bob.headers).status_code == 404
    assert client.delete(f"/api/v1/auth/tokens/{t['id']}", headers=alice.headers).status_code == 200
    assert client.get("/api/v1/auth/me", headers=bearer(t["token"])).status_code == 401


def test_tokens_cannot_manage_tokens_or_password(client, alice):
    t = create(client, alice)
    h = bearer(t["token"])
    assert client.get("/api/v1/auth/tokens/", headers=h).status_code == 403
    assert client.post("/api/v1/auth/tokens/", json={"name": "x"}, headers=h).status_code == 403
    r = client.post("/api/v1/auth/change-password", json={"current_password": "Secret-pass-1", "new_password": "Other-pass-99"},
                    headers=h)
    assert r.status_code == 403


def test_expired_unknown_and_deactivated(client, admin, alice):
    t = create(client, alice, expires_in_days=30)
    assert t["expires_at"] is not None
    assert client.get("/api/v1/auth/me", headers=bearer(t["token"])).status_code == 200
    sql("UPDATE api_tokens SET expires_at = now() - interval '1 minute' WHERE id = :i", i=t["id"])
    assert client.get("/api/v1/auth/me", headers=bearer(t["token"])).status_code == 401
    assert client.get("/api/v1/auth/me", headers=bearer("pm_not-a-real-token")).status_code == 401

    t2 = create(client, alice)
    client.put(f"/api/users/{alice.id}", json={"is_active": False}, headers=admin.headers)
    assert client.get("/api/v1/auth/me", headers=bearer(t2["token"])).status_code == 401
    assert client.post("/api/v1/auth/tokens/", json={"name": "x", "expires_in_days": 0}, headers=admin.headers).status_code == 422


def test_admin_token_can_use_admin_endpoints(client, admin):
    t = create(client, admin)
    assert client.get("/api/v1/users/admin/all", headers=bearer(t["token"])).status_code == 200


def test_docs_and_versioned_paths(client, alice):
    spec = client.get("/api/openapi.json").json()
    paths = spec["paths"]
    assert "/api/v1/tasks/" in paths and "/api/v1/auth/tokens/" in paths and "/api/v1/health" in paths
    assert not any(p.startswith("/api/tasks") for p in paths)  # only v1 is documented
    assert client.get("/api/docs").status_code == 200
    assert client.get("/api/v1/health").json()["status"] == "ok"
    assert client.get("/api/v1/tasks/", headers=alice.headers).status_code == 200
