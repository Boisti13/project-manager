def post(client, user, url, **data):
    r = client.post(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def by_id(client, user):
    return {t["id"]: t for t in client.get("/api/v1/tasks/", headers=user.headers).json()}


def bulk(client, user, updates):
    return client.post("/api/v1/tasks/bulk-update", json={"updates": updates}, headers=user.headers)


def test_same_change_for_several_tasks_and_undo(client, alice, bob):
    p = post(client, alice, "/api/v1/projects/", name="Lab")
    lab = post(client, alice, "/api/v1/labels/", name="hardware")
    a = post(client, alice, "/api/v1/tasks/", title="A", status="in_progress")
    b = post(client, alice, "/api/v1/tasks/", title="B", label_ids=[lab["id"]])
    c = post(client, alice, "/api/v1/tasks/", title="C")

    r = bulk(client, alice, [{"id": t["id"], "project_id": p["id"], "assignee_id": bob.id, "priority": 2,
                              "deadline": "2026-10-09T00:00:00", "label_ids": [lab["id"]]} for t in (a, b, c)])
    assert r.status_code == 200 and r.json() == {"updated": 3}
    tasks = by_id(client, alice)
    for t in (a, b, c):
        got = tasks[t["id"]]
        assert (got["project_id"], got["assignee_id"], got["priority"], got["label_ids"]) == (p["id"], bob.id, 2, [lab["id"]])
        assert got["deadline"].startswith("2026-10-09")
    # bob hears about it once, for all three
    items = client.get("/api/v1/notifications/", headers=bob.headers).json()["items"]
    assert [(n["kind"], n["excerpt"]) for n in items] == [("assigned", "and 2 more tasks")]
    # each task has its own history
    kinds = {x["kind"] for x in client.get(f"/api/v1/tasks/{a['id']}/activity", headers=alice.headers).json()}
    assert {"project", "assignee", "priority", "deadline", "labels"} <= kinds

    # done for all, then undo: each gets back its own status
    assert bulk(client, alice, [{"id": t["id"], "status": "done"} for t in (a, b, c)]).status_code == 200
    assert {by_id(client, alice)[t["id"]]["status"] for t in (a, b, c)} == {"done"}
    assert bulk(client, alice, [{"id": a["id"], "status": "in_progress"}, {"id": b["id"], "status": "todo"},
                                {"id": c["id"], "status": "todo"}]).status_code == 200
    tasks = by_id(client, alice)
    assert [tasks[t["id"]]["status"] for t in (a, b, c)] == ["in_progress", "todo", "todo"]

    # clearing a deadline
    bulk(client, alice, [{"id": a["id"], "deadline": None}])
    assert by_id(client, alice)[a["id"]]["deadline"] is None


def test_all_or_nothing(client, alice, bob):
    a = post(client, alice, "/api/v1/tasks/", title="A")
    secret = post(client, alice, "/api/v1/projects/", name="Secret", is_private=True)
    hidden = post(client, alice, "/api/v1/tasks/", title="hidden", project_id=secret["id"])

    # bob can't see one of them: nothing changes
    r = bulk(client, bob, [{"id": a["id"], "priority": 3}, {"id": hidden["id"], "priority": 3}])
    assert r.status_code == 404
    assert by_id(client, alice)[a["id"]]["priority"] == 0
    # a bad value in the second: the first isn't saved either
    r = bulk(client, alice, [{"id": a["id"], "priority": 3}, {"id": hidden["id"], "project_id": 99999}])
    assert r.status_code == 400
    assert by_id(client, alice)[a["id"]]["priority"] == 0
    assert bulk(client, alice, [{"id": a["id"], "priority": 1}, {"id": a["id"], "priority": 2}]).status_code == 400
    assert bulk(client, alice, []).status_code == 422
    # stale "expected" in one: 409, nothing saved
    r = bulk(client, alice, [{"id": a["id"], "priority": 3, "expected": {"priority": 2}}])
    assert r.status_code == 409


def test_bulk_done_spawns_and_undo_takes_back(client, alice):
    t = post(client, alice, "/api/v1/tasks/", title="Weekly", recurrence_unit="week", deadline="2026-10-01T00:00:00")
    bulk(client, alice, [{"id": t["id"], "status": "done"}])
    assert [x["title"] for x in by_id(client, alice).values()].count("Weekly") == 2
    bulk(client, alice, [{"id": t["id"], "status": "todo"}])
    assert [x["title"] for x in by_id(client, alice).values()].count("Weekly") == 1
