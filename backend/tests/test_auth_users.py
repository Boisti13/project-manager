from conftest import User


def test_first_account_is_admin_later_ones_are_not(client, admin, alice):
    assert admin.data["is_admin"] is True
    assert alice.data["is_admin"] is False


def test_register_rejects_duplicates(client, admin):
    client.put("/api/settings/", json={"allow_registration": True}, headers=admin.headers)
    r = client.post("/api/auth/register", json={"username": "admin", "email": "other@example.com", "password": "x" * 8})
    assert r.status_code == 400
    r = client.post("/api/auth/register", json={"username": "other", "email": "admin@example.com", "password": "x" * 8})
    assert r.status_code == 400


def test_login_and_me(client, alice):
    assert client.get("/api/auth/me", headers=alice.headers).json()["username"] == "alice"
    bad = client.post("/api/auth/login", data={"username": "alice", "password": "wrong"})
    assert bad.status_code == 401
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer nonsense"}).status_code == 401


def test_admin_manages_users(client, admin, alice):
    r = client.put(f"/api/users/{alice.id}", json={"is_admin": True}, headers=admin.headers)
    assert r.status_code == 200 and r.json()["is_admin"] is True
    # Non-admins can't
    bob = User(client, "bob", created_by=admin)
    assert client.put(f"/api/users/{alice.id}", json={"is_admin": False}, headers=bob.headers).status_code == 403
    assert client.get("/api/users/admin/all", headers=bob.headers).status_code == 403


def test_admin_cannot_demote_or_deactivate_self(client, admin):
    assert client.put(f"/api/users/{admin.id}", json={"is_admin": False}, headers=admin.headers).status_code == 400
    assert client.put(f"/api/users/{admin.id}", json={"is_active": False}, headers=admin.headers).status_code == 400


def test_deactivated_user_is_locked_out(client, admin, alice):
    r = client.put(f"/api/users/{alice.id}", json={"is_active": False}, headers=admin.headers)
    assert r.status_code == 200
    # Existing token stops working ...
    assert client.get("/api/auth/me", headers=alice.headers).status_code == 401
    assert client.get("/api/tasks/", headers=alice.headers).status_code == 401
    # ... and so does logging in again.
    r = client.post("/api/auth/login", data={"username": "alice", "password": alice.password})
    assert r.status_code == 403
    # Hidden from the assignee list, still visible to admins.
    assert "alice" not in [u["username"] for u in client.get("/api/users/", headers=admin.headers).json()]
    assert "alice" in [u["username"] for u in client.get("/api/users/admin/all", headers=admin.headers).json()]
    # Reactivating restores access.
    client.put(f"/api/users/{alice.id}", json={"is_active": True}, headers=admin.headers)
    assert client.post("/api/auth/login", data={"username": "alice", "password": alice.password}).status_code == 200
