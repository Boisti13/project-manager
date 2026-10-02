def bulk(client, user, items, **shared):
    return client.post("/api/tasks/bulk", json={"items": items, **shared}, headers=user.headers)


def tasks_by_title(client, user):
    return {t["title"]: t for t in client.get("/api/tasks/", headers=user.headers).json()}


def test_tree_with_shared_fields(client, alice):
    p = client.post("/api/projects/", json={"name": "6GHub"}, headers=alice.headers).json()["id"]
    r = bulk(client, alice, [
        {"title": "Order parts", "children": [
            {"title": "Antenna modules"},
            {"title": "Cables", "children": [{"title": "Measure lengths"}]},
        ]},
        {"title": "Write guide"},
        {"title": "Flash firmware", "status": "done"},
    ], project_id=p, priority=2, deadline="2026-10-01T00:00:00", assignee_id=alice.id, status="in_progress")
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 6
    t = tasks_by_title(client, alice)
    assert t["Antenna modules"]["parent_task_id"] == t["Order parts"]["id"]
    assert t["Measure lengths"]["parent_task_id"] == t["Cables"]["id"]
    assert t["Write guide"]["parent_task_id"] is None
    for task in t.values():
        assert (task["project_id"], task["priority"], task["assignee_id"]) == (p, 2, alice.id)
        assert task["deadline"].startswith("2026-10-01")
    assert t["Write guide"]["status"] == "in_progress" and t["Write guide"]["completed_at"] is None
    assert t["Flash firmware"]["status"] == "done" and t["Flash firmware"]["completed_at"] is not None
    # order follows the input
    assert [t[n]["order"] for n in ("Order parts", "Write guide", "Flash firmware")] == [0, 1, 2]
    assert [t[n]["order"] for n in ("Antenna modules", "Cables")] == [0, 1]


def test_appends_after_existing_siblings(client, alice):
    client.post("/api/tasks/", json={"title": "existing", "order": 5}, headers=alice.headers)
    bulk(client, alice, [{"title": "a"}, {"title": "b"}])
    t = tasks_by_title(client, alice)
    assert (t["a"]["order"], t["b"]["order"]) == (6, 7)


def test_under_a_parent_inherits_its_project(client, alice):
    p = client.post("/api/projects/", json={"name": "P"}, headers=alice.headers).json()["id"]
    parent = client.post("/api/tasks/", json={"title": "parent", "project_id": p}, headers=alice.headers).json()
    r = bulk(client, alice, [{"title": "sub 1"}, {"title": "sub 2", "children": [{"title": "sub 2.1"}]}],
             parent_task_id=parent["id"])
    assert r.json()["created"] == 3
    t = tasks_by_title(client, alice)
    assert t["sub 1"]["parent_task_id"] == parent["id"] and t["sub 1"]["project_id"] == p
    assert t["sub 2.1"]["parent_task_id"] == t["sub 2"]["id"]


def test_all_or_nothing(client, alice):
    assert bulk(client, alice, [{"title": "ok"}, {"title": "   "}]).status_code == 422
    assert bulk(client, alice, [{"title": "ok"}], project_id=9999).status_code == 400
    assert bulk(client, alice, [{"title": "ok"}], parent_task_id=9999).status_code == 404
    assert bulk(client, alice, [{"title": "ok"}], assignee_id=9999).status_code == 400
    assert bulk(client, alice, []).status_code == 422
    assert client.get("/api/tasks/", headers=alice.headers).json() == []


def test_limit(client, alice):
    too_many = [{"title": f"t{i}"} for i in range(501)]
    r = bulk(client, alice, too_many)
    assert r.status_code == 400 and "500" in r.json()["detail"]
    nested = [{"title": "root", "children": [{"title": f"c{i}"} for i in range(500)]}]
    assert bulk(client, alice, nested).status_code == 400
    assert bulk(client, alice, [{"title": f"t{i}"} for i in range(500)]).json()["created"] == 500


def test_requires_login(client):
    assert client.post("/api/tasks/bulk", json={"items": [{"title": "x"}]}).status_code == 401


def test_per_line_fields_override_the_shared_ones(client, alice, bob, admin):
    hw = client.post("/api/v1/labels/", json={"name": "hardware"}, headers=alice.headers).json()["id"]
    urgent = client.post("/api/v1/labels/", json={"name": "urgent"}, headers=alice.headers).json()["id"]
    r = bulk(client, alice, [
        {"title": "Call supplier", "priority": 3, "deadline": "2026-10-05T00:00:00", "assignee_id": bob.id, "label_ids": [urgent]},
        {"title": "Weekly sync", "recurrence_unit": "week", "recurrence_weekdays": [0], "deadline": "2026-10-05T00:00:00"},
        {"title": "Fair", "start_date": "2026-10-05T00:00:00", "deadline": "2026-10-09T00:00:00",
         "children": [{"title": "Book booth", "assignee_id": bob.id}]},
        {"title": "Plain"},
    ], priority=1, deadline="2026-10-01T00:00:00", label_ids=[hw], assignee_id=admin.id)
    assert r.status_code == 200, r.text
    t = tasks_by_title(client, alice)
    assert (t["Call supplier"]["priority"], t["Call supplier"]["assignee_id"]) == (3, bob.id)
    assert t["Call supplier"]["deadline"].startswith("2026-10-05")
    assert sorted(t["Call supplier"]["label_ids"]) == sorted([hw, urgent])  # added to the shared ones
    assert (t["Plain"]["priority"], t["Plain"]["assignee_id"], t["Plain"]["label_ids"]) == (1, admin.id, [hw])
    assert t["Plain"]["deadline"].startswith("2026-10-01")
    assert (t["Weekly sync"]["recurrence_unit"], t["Weekly sync"]["recurrence_weekdays"]) == ("week", [0])
    assert t["Fair"]["start_date"].startswith("2026-10-05")

    # one notification per person: bob for his two, admin for the other three
    bobs = client.get("/api/v1/notifications/", headers=bob.headers).json()["items"]
    assert [(n["kind"], n["excerpt"]) for n in bobs] == [("assigned", "and 1 more task")]
    admins = client.get("/api/v1/notifications/", headers=admin.headers).json()["items"]
    assert [(n["kind"], n["excerpt"]) for n in admins] == [("assigned", "and 2 more tasks")]


def test_per_line_checks(client, alice):
    assert bulk(client, alice, [{"title": "x", "start_date": "2026-10-09T00:00:00", "deadline": "2026-10-05T00:00:00"}]).status_code == 400
    assert bulk(client, alice, [{"title": "x", "assignee_id": 99999}]).status_code == 400
    assert bulk(client, alice, [{"title": "x", "recurrence_unit": "week", "recurrence_weekdays": [9]}]).status_code == 422
    assert client.get("/api/tasks/", headers=alice.headers).json() == []  # all or nothing
