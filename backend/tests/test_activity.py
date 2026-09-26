def activity(client, user, task_id):
    r = client.get(f"/api/tasks/{task_id}/activity", headers=user.headers)
    assert r.status_code == 200, r.text
    return [(a["kind"], a["actor"], a["old_value"], a["new_value"]) for a in r.json()]


def test_changes_are_logged_with_names(client, admin, alice, bob):
    h = alice.headers
    six = client.post("/api/projects/", json={"name": "6GHub"}, headers=h).json()["id"]
    ordering = client.post("/api/projects/", json={"name": "Ordering", "parent_id": six}, headers=h).json()["id"]
    t = client.post("/api/tasks/", json={"title": "Order cables", "project_id": six}, headers=h).json()
    client.put(f"/api/tasks/{t['id']}", json={
        "title": "Order CAT6 cables", "status": "in_progress", "assignee_id": bob.id, "project_id": ordering,
        "deadline": "2026-10-01T00:00:00", "priority": 2, "description": "20 pcs",
        "recurrence_unit": "month",
    }, headers=h)
    # saving the form again without changes logs nothing
    client.put(f"/api/tasks/{t['id']}", json={"title": "Order CAT6 cables", "priority": 2}, headers=h)
    client.put(f"/api/tasks/{t['id']}", json={"status": "done"}, headers=bob.headers)

    log = activity(client, alice, t["id"])
    assert log[0] == ("created", "alice", None, None)
    assert set(log[1:9]) == {
        ("title", "alice", "Order cables", "Order CAT6 cables"),
        ("description", "alice", None, None),
        ("status", "alice", "todo", "in_progress"),
        ("priority", "alice", "0", "2"),
        ("deadline", "alice", None, "2026-10-01"),
        ("assignee", "alice", None, "bob"),
        ("project", "alice", "6GHub", "6GHub / Ordering"),
        ("recurrence", "alice", None, "month:1"),
    }
    assert log[9] == ("status", "bob", "in_progress", "done")
    assert log[10][0] == "next_created" and log[10][3] == "2026-11-01"
    assert len(log) == 11

    nxt = max((x for x in client.get("/api/tasks/", headers=h).json() if x["title"] == "Order CAT6 cables"),
              key=lambda x: x["id"])
    assert activity(client, alice, nxt["id"]) == [
        ("created", "bob", None, None),
        ("repeat_of", "bob", str(t["id"]), "2026-11-01"),
    ]


def test_bulk_add_logs_created(client, alice):
    r = client.post("/api/tasks/bulk", json={"items": [{"title": "A", "children": [{"title": "A1"}]}]},
                    headers=alice.headers).json()
    for tid in r["ids"]:
        assert activity(client, alice, tid) == [("created", "alice", None, None)]


def test_deleted_actor_and_task(client, admin, alice, bob):
    t = client.post("/api/tasks/", json={"title": "x"}, headers=bob.headers).json()
    from sqlalchemy import text
    from app.database import SessionLocal
    with SessionLocal() as db:  # no API for deleting users; the FK sets actor to NULL
        db.execute(text("UPDATE tasks SET assignee_id = NULL WHERE assignee_id = :u"), {"u": bob.id})
        db.execute(text("DELETE FROM users WHERE id = :u"), {"u": bob.id})
        db.commit()
    assert activity(client, alice, t["id"]) == [("created", None, None, None)]
    client.delete(f"/api/tasks/{t['id']}", headers=alice.headers)
    assert client.get(f"/api/tasks/{t['id']}/activity", headers=alice.headers).status_code == 404
    assert client.get("/api/tasks/1/activity").status_code == 401
