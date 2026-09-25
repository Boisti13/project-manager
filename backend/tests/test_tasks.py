def task(client, user, **data):
    r = client.post("/api/tasks/", json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_create_and_update(client, alice):
    t = task(client, alice, title="Write docs", priority=2, deadline="2026-10-01T00:00:00")
    assert (t["status"], t["priority"], t["completed_at"], t["comment_count"]) == ("todo", 2, None, 0)
    r = client.put(f"/api/tasks/{t['id']}", json={"status": "in_progress"}, headers=alice.headers).json()
    assert r["status"] == "in_progress" and r["title"] == "Write docs"


def test_completed_at_follows_status(client, alice):
    h = alice.headers
    t = task(client, alice, title="x")
    done = client.put(f"/api/tasks/{t['id']}", json={"status": "done"}, headers=h).json()
    assert done["completed_at"] is not None
    # other edits keep the completion time
    again = client.put(f"/api/tasks/{t['id']}", json={"title": "y"}, headers=h).json()
    assert again["completed_at"] == done["completed_at"]
    reopened = client.put(f"/api/tasks/{t['id']}", json={"status": "todo"}, headers=h).json()
    assert reopened["completed_at"] is None
    assert task(client, alice, title="born done", status="done")["completed_at"] is not None


def test_subtasks_and_cascade_delete(client, alice):
    h = alice.headers
    parent = task(client, alice, title="parent")
    child = task(client, alice, title="child", parent_task_id=parent["id"])
    grandchild = task(client, alice, title="grandchild", parent_task_id=child["id"])
    listed = {t["id"]: t for t in client.get("/api/tasks/", headers=h).json()}
    assert listed[grandchild["id"]]["parent_task_id"] == child["id"]
    assert client.delete(f"/api/tasks/{parent['id']}", headers=h).status_code == 200
    assert client.get("/api/tasks/", headers=h).json() == []


def test_unknown_task(client, alice):
    h = alice.headers
    assert client.get("/api/tasks/9999", headers=h).status_code == 404
    assert client.put("/api/tasks/9999", json={"title": "x"}, headers=h).status_code == 404
    assert client.delete("/api/tasks/9999", headers=h).status_code == 404


def test_order_and_listing(client, alice):
    task(client, alice, title="b", order=1)
    task(client, alice, title="a", order=0)
    assert [t["title"] for t in client.get("/api/tasks/", headers=alice.headers).json()] == ["a", "b"]


def test_assignee_unset_when_user_is_removed_is_not_possible_via_api(client, admin, alice):
    # Users are deactivated, never deleted; assignment survives deactivation.
    t = task(client, admin, title="x", assignee_id=alice.id)
    client.put(f"/api/users/{alice.id}", json={"is_active": False}, headers=admin.headers)
    assert client.get(f"/api/tasks/{t['id']}", headers=admin.headers).json()["assignee_id"] == alice.id
