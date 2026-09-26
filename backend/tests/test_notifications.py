from conftest import User


def bell(client, user):
    r = client.get("/api/notifications/", headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_assignment_on_create_update_and_bulk(client, admin, alice, bob):
    h = bob.headers
    t = client.post("/api/tasks/", json={"title": "Order parts", "assignee_id": alice.id}, headers=h).json()
    b = bell(client, alice)
    assert b["unread"] == 1
    n = b["items"][0]
    assert (n["kind"], n["task_id"], n["task_title"], n["actor"], n["read"]) == ("assigned", t["id"], "Order parts", "bob", False)

    # reassigning to alice again doesn't repeat; moving it away and back does
    client.put(f"/api/tasks/{t['id']}", json={"title": "Order parts!"}, headers=h)
    assert bell(client, alice)["unread"] == 1
    client.put(f"/api/tasks/{t['id']}", json={"assignee_id": admin.id}, headers=h)
    assert bell(client, admin)["unread"] == 1
    client.put(f"/api/tasks/{t['id']}", json={"assignee_id": alice.id}, headers=h)
    assert bell(client, alice)["unread"] == 2

    # bulk: one notification for the batch
    client.post("/api/tasks/bulk", json={"items": [{"title": "a", "children": [{"title": "a1"}]}, {"title": "b"}],
                                         "assignee_id": alice.id}, headers=h)
    items = bell(client, alice)["items"]
    assert len(items) == 3 and items[0]["task_title"] == "a" and items[0]["excerpt"] == "and 2 more tasks"


def test_no_notification_for_own_actions_or_inactive_users(client, admin, alice):
    client.post("/api/tasks/", json={"title": "mine", "assignee_id": alice.id}, headers=alice.headers)
    assert bell(client, alice)["unread"] == 0
    client.put(f"/api/users/{alice.id}", json={"is_active": False}, headers=admin.headers)
    client.post("/api/tasks/", json={"title": "x", "assignee_id": alice.id}, headers=admin.headers)
    client.put(f"/api/users/{alice.id}", json={"is_active": True}, headers=admin.headers)
    assert bell(client, alice)["unread"] == 0


def test_comments_notify_assignee_and_participants(client, admin, alice, bob):
    carol = User(client, "carol", created_by=admin)
    t = client.post("/api/tasks/", json={"title": "Plan", "assignee_id": alice.id}, headers=admin.headers).json()
    client.post("/api/notifications/read", json={}, headers=alice.headers)

    client.post(f"/api/tasks/{t['id']}/comments", json={"body": "First thought"}, headers=bob.headers)
    b = bell(client, alice)
    assert b["unread"] == 1 and b["items"][0]["kind"] == "comment" and b["items"][0]["excerpt"] == "First thought"
    assert bell(client, bob)["unread"] == 0  # own comment

    long_text = "x " * 200
    client.post(f"/api/tasks/{t['id']}/comments", json={"body": long_text}, headers=carol.headers)
    assert bell(client, bob)["unread"] == 1  # bob commented before -> participant
    ex = bell(client, alice)["items"][0]["excerpt"]
    assert len(ex) == 140 and ex.endswith("…")
    assert bell(client, admin)["unread"] == 0  # admin created the task but isn't assignee or commenter


def test_mark_read(client, admin, alice):
    for i in range(3):
        client.post("/api/tasks/", json={"title": f"t{i}", "assignee_id": alice.id}, headers=admin.headers)
    items = bell(client, alice)["items"]
    r = client.post("/api/notifications/read", json={"ids": [items[0]["id"]]}, headers=alice.headers).json()
    assert r["marked"] == 1 and bell(client, alice)["unread"] == 2
    # can't mark someone else's
    client.post("/api/notifications/read", json={"ids": [items[1]["id"]]}, headers=admin.headers)
    assert bell(client, alice)["unread"] == 2
    client.post("/api/notifications/read", json={}, headers=alice.headers)
    b = bell(client, alice)
    assert b["unread"] == 0 and all(n["read"] for n in b["items"])


def test_old_read_notifications_are_cleaned_up(client, admin, alice):
    from sqlalchemy import text
    from app.database import engine

    client.post("/api/tasks/", json={"title": "old", "assignee_id": alice.id}, headers=admin.headers)
    client.post("/api/tasks/", json={"title": "new", "assignee_id": alice.id}, headers=admin.headers)
    with engine.begin() as c:
        c.execute(text("UPDATE notifications SET read_at = now() - interval '61 days' "
                       "WHERE task_id = (SELECT id FROM tasks WHERE title = 'old')"))
    assert [n["task_title"] for n in bell(client, alice)["items"]] == ["new"]


def test_deleting_a_task_removes_its_notifications(client, admin, alice):
    t = client.post("/api/tasks/", json={"title": "gone", "assignee_id": alice.id}, headers=admin.headers).json()
    client.delete(f"/api/tasks/{t['id']}", headers=admin.headers)
    assert bell(client, alice)["items"] == []


def test_requires_login(client):
    assert client.get("/api/notifications/").status_code == 401
