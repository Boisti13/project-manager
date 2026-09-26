"""Private projects: only members and admins see them and everything in them."""
import pytest


def post(client, user, url, **data):
    r = client.post(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def project_ids(client, user):
    return {p["id"] for p in client.get("/api/projects/", headers=user.headers).json()}


def task_titles(client, user):
    return sorted(t["title"] for t in client.get("/api/tasks/", headers=user.headers).json())


@pytest.fixture
def secret(client, alice):
    """alice's private project with a category, tasks, a subtask and a comment."""
    p = post(client, alice, "/api/projects/", name="Secret", is_private=True)
    cat = post(client, alice, "/api/projects/", name="Inner", parent_id=p["id"])
    t = post(client, alice, "/api/tasks/", title="hidden task", project_id=p["id"])
    post(client, alice, "/api/tasks/", title="hidden subtask", parent_task_id=t["id"])
    c = post(client, alice, "/api/tasks/", title="hidden in category", project_id=cat["id"])
    post(client, alice, f"/api/tasks/{t['id']}/comments", body="needle in a private haystack")
    return {"project": p, "category": cat, "task": t, "cat_task": c}


def test_public_by_default(client, alice, bob):
    p = post(client, alice, "/api/projects/", name="Open")
    assert (p["is_private"], p["member_ids"]) == (False, [])
    post(client, alice, "/api/tasks/", title="open task", project_id=p["id"])
    post(client, alice, "/api/tasks/", title="no project")
    assert p["id"] in project_ids(client, bob)
    assert task_titles(client, bob) == ["no project", "open task"]


def test_private_project_is_hidden_from_non_members(client, admin, alice, bob, secret):
    p, t = secret["project"], secret["task"]
    assert p["member_ids"] == [alice.id]  # the creator is a member automatically
    h = bob.headers

    assert project_ids(client, bob) == set()
    assert task_titles(client, bob) == []
    assert client.get(f"/api/projects/{p['id']}", headers=h).status_code == 404
    assert client.put(f"/api/projects/{p['id']}", json={"name": "x"}, headers=h).status_code == 404
    assert client.delete(f"/api/projects/{p['id']}", headers=h).status_code == 404
    for url in (f"/api/tasks/{t['id']}", f"/api/tasks/{t['id']}/comments", f"/api/tasks/{t['id']}/activity"):
        assert client.get(url, headers=h).status_code == 404, url
    assert client.put(f"/api/tasks/{t['id']}", json={"status": "done"}, headers=h).status_code == 404
    assert client.delete(f"/api/tasks/{t['id']}", headers=h).status_code == 404
    assert client.post(f"/api/tasks/{t['id']}/comments", json={"body": "hi"}, headers=h).status_code == 404
    comment_id = client.get(f"/api/tasks/{t['id']}/comments", headers=alice.headers).json()[0]["id"]
    assert client.delete(f"/api/comments/{comment_id}", headers=h).status_code == 404
    assert client.get("/api/comments/search", params={"q": "needle"}, headers=h).json() == []
    # can't put things into it either
    assert client.post("/api/tasks/", json={"title": "x", "project_id": p["id"]}, headers=h).status_code == 400
    assert client.post("/api/tasks/", json={"title": "x", "parent_task_id": t["id"]}, headers=h).status_code == 404
    assert client.post("/api/tasks/bulk", json={"items": [{"title": "x"}], "project_id": p["id"]}, headers=h).status_code == 400
    mine = post(client, bob, "/api/tasks/", title="bob's")
    assert client.put(f"/api/tasks/{mine['id']}", json={"project_id": secret["category"]["id"]}, headers=h).status_code == 400
    assert client.post("/api/projects/", json={"name": "c", "parent_id": p["id"]}, headers=h).status_code == 400
    exp = client.get("/api/transfer/export", headers=h).json()
    assert exp["projects"] == []
    assert client.get("/api/transfer/export", params={"project_id": p["id"]}, headers=h).status_code == 404

    # members and admins see everything
    for user in (alice, admin):
        assert {p["id"], secret["category"]["id"]} <= project_ids(client, user)
        assert {"hidden task", "hidden subtask", "hidden in category"} <= set(task_titles(client, user))
    assert client.get("/api/comments/search", params={"q": "needle"}, headers=admin.headers).json() == [t["id"]]


def test_adding_and_removing_members(client, alice, bob, secret):
    p = secret["project"]
    r = client.put(f"/api/projects/{p['id']}", json={"member_ids": [alice.id, bob.id]}, headers=alice.headers)
    assert r.json()["member_ids"] == sorted([alice.id, bob.id], key=lambda i: {alice.id: "alice", bob.id: "bob"}[i])
    assert "hidden subtask" in task_titles(client, bob)
    # bob, now a member, can manage it too; making it public shows it to everyone
    r = client.put(f"/api/projects/{p['id']}", json={"member_ids": [bob.id]}, headers=bob.headers)
    assert r.json()["member_ids"] == [bob.id]
    assert task_titles(client, alice) == []
    client.put(f"/api/projects/{p['id']}", json={"is_private": False}, headers=bob.headers)
    assert "hidden task" in task_titles(client, alice)


def test_making_private_keeps_yourself_in(client, admin, alice, bob):
    p = post(client, bob, "/api/projects/", name="Mine")
    r = client.put(f"/api/projects/{p['id']}", json={"is_private": True, "member_ids": [alice.id]}, headers=bob.headers)
    assert set(r.json()["member_ids"]) == {alice.id, bob.id}
    # the creator is a member, admins included; admins may leave afterwards
    q = post(client, admin, "/api/projects/", name="Admin's", is_private=True, member_ids=[alice.id])
    assert set(q["member_ids"]) == {admin.id, alice.id}
    r = client.put(f"/api/projects/{q['id']}", json={"member_ids": [alice.id]}, headers=admin.headers)
    assert r.json()["member_ids"] == [alice.id]
    assert client.post("/api/projects/", json={"name": "x", "is_private": True, "member_ids": [999]},
                       headers=admin.headers).status_code == 400


def test_categories_follow_their_project(client, alice, secret):
    cat = secret["category"]
    r = client.put(f"/api/projects/{cat['id']}", json={"is_private": True}, headers=alice.headers)
    assert r.status_code == 400
    r = client.post("/api/projects/", json={"name": "c", "parent_id": secret["project"]["id"], "is_private": True},
                    headers=alice.headers)
    assert r.status_code == 400


def test_assignee_must_be_able_to_see_the_task(client, alice, bob, secret):
    p, t = secret["project"], secret["task"]
    r = client.put(f"/api/tasks/{t['id']}", json={"assignee_id": bob.id}, headers=alice.headers)
    assert r.status_code == 400 and "isn't a member" in r.json()["detail"]
    r = client.post("/api/tasks/", json={"title": "x", "project_id": p["id"], "assignee_id": bob.id}, headers=alice.headers)
    assert r.status_code == 400
    # a task assigned to bob can't be moved into the private project
    open_task = post(client, alice, "/api/tasks/", title="for bob", assignee_id=bob.id)
    r = client.put(f"/api/tasks/{open_task['id']}", json={"project_id": p["id"]}, headers=alice.headers)
    assert r.status_code == 400
    client.put(f"/api/projects/{p['id']}", json={"member_ids": [alice.id, bob.id]}, headers=alice.headers)
    assert client.put(f"/api/tasks/{t['id']}", json={"assignee_id": bob.id}, headers=alice.headers).status_code == 200


def test_notifications_follow_access(client, alice, bob, secret):
    p, t = secret["project"], secret["task"]
    client.put(f"/api/projects/{p['id']}", json={"member_ids": [alice.id, bob.id]}, headers=alice.headers)
    client.put(f"/api/tasks/{t['id']}", json={"assignee_id": bob.id}, headers=alice.headers)
    assert client.get("/api/notifications/", headers=bob.headers).json()["unread"] == 1
    # removed from the project: the notification disappears, and new comments
    # don't notify him
    client.put(f"/api/projects/{p['id']}", json={"member_ids": [alice.id]}, headers=alice.headers)
    post(client, alice, f"/api/tasks/{t['id']}/comments", body="still there?")
    n = client.get("/api/notifications/", headers=bob.headers).json()
    assert (n["unread"], n["items"]) == (0, [])


def test_export_import_keeps_privacy(client, alice, bob, secret):
    exp = client.get("/api/transfer/export", params={"project_id": secret["project"]["id"]}, headers=alice.headers).json()
    assert exp["projects"][0]["is_private"] is True
    client.post("/api/transfer/import", json=exp, headers=bob.headers)
    mine = [p for p in client.get("/api/projects/", headers=bob.headers).json() if p["parent_id"] is None]
    assert [(p["name"], p["is_private"], p["member_ids"]) for p in mine] == [("Secret (2)", True, [bob.id])]
    # alice doesn't see bob's private copy
    assert "Secret (2)" not in {p["name"] for p in client.get("/api/projects/", headers=alice.headers).json()}
