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
