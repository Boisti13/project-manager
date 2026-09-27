from sqlalchemy import text


def post(client, user, url, **data):
    r = client.post(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def sync(client, user, since=None):
    r = client.get("/api/v1/sync/", params={"since": since} if since else {}, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def age_everything():
    """Pretend all existing rows were last changed an hour ago."""
    from app.database import engine

    with engine.begin() as c:
        for table in ("tasks", "projects", "labels"):
            c.execute(text(f"UPDATE {table} SET updated_at = now() - interval '1 hour'"))
        c.execute(text("UPDATE task_comments SET created_at = now() - interval '1 hour', edited_at = NULL"))


def titles(tasks):
    return sorted(t["title"] for t in tasks)


def test_full_then_incremental(client, alice, bob):
    p = post(client, alice, "/api/v1/projects/", name="P")
    lab = post(client, alice, "/api/v1/labels/", name="L")
    a = post(client, alice, "/api/v1/tasks/", title="A", project_id=p["id"], label_ids=[lab["id"]])
    b = post(client, alice, "/api/v1/tasks/", title="B", parent_task_id=a["id"])
    post(client, alice, f"/api/v1/tasks/{a['id']}/comments", body="hello")

    full = sync(client, bob)
    assert full["full"] is True and full["deletions"] == []
    assert titles(full["tasks"]) == ["A", "B"]
    assert "subtasks" not in full["tasks"][0]  # flat
    assert [x["name"] for x in full["projects"]] == ["P"] and [x["name"] for x in full["labels"]] == ["L"]
    assert full["labels"][0]["task_count"] == 1
    assert [c["body"] for c in full["comments"]] == ["hello"]
    assert {u["username"] for u in full["users"]} >= {"alice", "bob"}
    assert sorted(full["ids"]["tasks"]) == sorted([a["id"], b["id"]])

    age_everything()
    cursor = sync(client, bob)["cursor"]
    nothing = sync(client, bob, cursor)
    assert nothing["full"] is False
    assert (nothing["tasks"], nothing["projects"], nothing["labels"], nothing["comments"], nothing["deletions"]) == \
        ([], [], [], [], [])
    assert sorted(nothing["ids"]["tasks"]) == sorted([a["id"], b["id"]])  # still visible

    # changes since the cursor: an edit, a new task, a comment on an unchanged task, a deletion
    client.put(f"/api/v1/tasks/{b['id']}", json={"status": "done"}, headers=alice.headers)
    c = post(client, alice, "/api/v1/tasks/", title="C")
    post(client, alice, f"/api/v1/tasks/{a['id']}/comments", body="second")
    client.delete(f"/api/v1/labels/{lab['id']}", headers=alice.headers)
    delta = sync(client, bob, cursor)
    # A comes along because deleting its label changed it
    assert titles(delta["tasks"]) == ["A", "B", "C"]
    assert {x["body"] for x in delta["comments"]} == {"hello", "second"}  # all comments of resent tasks
    assert [(d["entity"], d["id"]) for d in delta["deletions"]] == [("label", lab["id"])]
    assert delta["ids"]["labels"] == [] and c["id"] in delta["ids"]["tasks"]
    assert client.get("/api/v1/sync/", params={"since": "yesterday"}, headers=bob.headers).status_code == 422


def test_private_projects_and_gaining_access(client, alice, bob):
    p = post(client, alice, "/api/v1/projects/", name="Secret", is_private=True)
    t = post(client, alice, "/api/v1/tasks/", title="hidden", project_id=p["id"])
    post(client, alice, f"/api/v1/tasks/{t['id']}/comments", body="psst")
    full = sync(client, bob)
    assert (full["tasks"], full["projects"], full["comments"]) == ([], [], [])
    assert t["id"] not in full["ids"]["tasks"]

    age_everything()
    cursor = sync(client, bob)["cursor"]
    client.put(f"/api/v1/projects/{p['id']}", json={"member_ids": [alice.id, bob.id]}, headers=alice.headers)
    delta = sync(client, bob, cursor)
    # bob just got access: the project, its task and the comment arrive incrementally
    assert [x["name"] for x in delta["projects"]] == ["Secret"]
    assert titles(delta["tasks"]) == ["hidden"] and [c["body"] for c in delta["comments"]] == ["psst"]

    # removed again: the ids tell bob's client to drop them
    cursor = delta["cursor"]
    client.put(f"/api/v1/projects/{p['id']}", json={"member_ids": [alice.id]}, headers=alice.headers)
    gone = sync(client, bob, cursor)
    assert t["id"] not in gone["ids"]["tasks"] and p["id"] not in gone["ids"]["projects"]


def test_expected_values_detect_conflicts(client, alice, bob):
    t = post(client, alice, "/api/v1/tasks/", title="Order", priority=1, deadline="2026-10-01T00:00:00")
    # bob edited offline based on priority 1; meanwhile alice set 2
    client.put(f"/api/v1/tasks/{t['id']}", json={"priority": 2}, headers=alice.headers)
    r = client.put(f"/api/v1/tasks/{t['id']}", json={"priority": 3, "expected": {"priority": 1}}, headers=bob.headers)
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["conflicts"] == {"priority": {"expected": 1, "current": 2}} and detail["task"]["priority"] == 2
    assert client.get(f"/api/v1/tasks/{t['id']}", headers=bob.headers).json()["priority"] == 2  # nothing saved

    # a different field that nobody touched: goes through (per-field merge)
    r = client.put(f"/api/v1/tasks/{t['id']}", json={"title": "Order parts", "expected": {"title": "Order"}},
                   headers=bob.headers)
    assert r.status_code == 200 and r.json()["title"] == "Order parts" and r.json()["priority"] == 2
    # equal values in other formats count as unchanged
    r = client.put(f"/api/v1/tasks/{t['id']}", json={"status": "in_progress", "expected": {
        "deadline": "2026-10-01", "status": "todo", "label_ids": []}}, headers=bob.headers)
    assert r.status_code == 200, r.text
    # without expected: last write wins
    assert client.put(f"/api/v1/tasks/{t['id']}", json={"priority": 3}, headers=bob.headers).json()["priority"] == 3
    r = client.put(f"/api/v1/tasks/{t['id']}", json={"expected": {"bogus": 1}}, headers=bob.headers)
    assert r.status_code == 422
