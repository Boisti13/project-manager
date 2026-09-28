def post(client, user, url, **data):
    r = client.post(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def put(client, user, url, **data):
    r = client.put(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


# ---- time estimates ---------------------------------------------------------

def test_estimate_create_update_and_history(client, alice):
    task = post(client, alice, "/api/v1/tasks/", title="Write guide", estimate_minutes=90)
    assert task["estimate_minutes"] == 90
    assert post(client, alice, "/api/v1/tasks/", title="No estimate")["estimate_minutes"] is None

    assert put(client, alice, f"/api/v1/tasks/{task['id']}", estimate_minutes=120)["estimate_minutes"] == 120
    assert put(client, alice, f"/api/v1/tasks/{task['id']}", estimate_minutes=None)["estimate_minutes"] is None
    kinds = [(a["kind"], a["old_value"], a["new_value"])
             for a in client.get(f"/api/v1/tasks/{task['id']}/activity", headers=alice.headers).json()]
    assert ("estimate", "90", "120") in kinds and ("estimate", "120", None) in kinds

    for bad in (0, -5, 60 * 24 * 365 + 1):
        r = client.put(f"/api/v1/tasks/{task['id']}", json={"estimate_minutes": bad}, headers=alice.headers)
        assert r.status_code == 422


def test_estimate_carries_over_to_next_occurrence_and_export(client, alice):
    task = post(client, alice, "/api/v1/tasks/", title="Weekly report", estimate_minutes=30,
                deadline="2026-10-01T00:00:00", recurrence_unit="week")
    put(client, alice, f"/api/v1/tasks/{task['id']}", status="done")
    nxt = [t for t in client.get("/api/v1/tasks/", headers=alice.headers).json()
           if t["title"] == "Weekly report" and t["status"] == "todo"]
    assert len(nxt) == 1 and nxt[0]["estimate_minutes"] == 30

    project = post(client, alice, "/api/v1/projects/", name="Docs")
    post(client, alice, "/api/v1/tasks/", title="Chapter 1", project_id=project["id"], estimate_minutes=240)
    exported = client.get(f"/api/v1/transfer/export?project_id={project['id']}", headers=alice.headers).json()
    assert exported["projects"][0]["tasks"][0]["estimate_minutes"] == 240
    post(client, alice, "/api/v1/transfer/import", **exported)
    copies = [t for t in client.get("/api/v1/tasks/", headers=alice.headers).json() if t["title"] == "Chapter 1"]
    assert [t["estimate_minutes"] for t in copies] == [240, 240]


def test_estimate_in_sync_and_expected(client, alice):
    task = post(client, alice, "/api/v1/tasks/", title="Sync me", estimate_minutes=45)
    synced = client.get("/api/v1/sync/", headers=alice.headers).json()
    assert {t["id"]: t["estimate_minutes"] for t in synced["tasks"]}[task["id"]] == 45
    r = client.put(f"/api/v1/tasks/{task['id']}", json={"estimate_minutes": 60, "expected": {"estimate_minutes": 30}},
                   headers=alice.headers)
    assert r.status_code == 409


# ---- saved filters -----------------------------------------------------------

def test_saved_filters_per_user(client, alice, bob):
    assert client.get("/api/v1/saved-filters/", headers=alice.headers).json() == []
    urgent = post(client, alice, "/api/v1/saved-filters/", name="  My   urgent ", query="?assignee=me&label=3")
    assert urgent["name"] == "My urgent" and urgent["query"] == "assignee=me&label=3"
    post(client, alice, "/api/v1/saved-filters/", name="all overdue", query="due=overdue")
    names = [f["name"] for f in client.get("/api/v1/saved-filters/", headers=alice.headers).json()]
    assert names == ["all overdue", "My urgent"]  # alphabetical, ignoring case

    # Same name again replaces it.
    again = post(client, alice, "/api/v1/saved-filters/", name="My urgent", query="assignee=me&sort=deadline")
    assert again["id"] == urgent["id"] and again["query"] == "assignee=me&sort=deadline"

    # Other users see and touch only their own.
    assert client.get("/api/v1/saved-filters/", headers=bob.headers).json() == []
    assert client.delete(f"/api/v1/saved-filters/{urgent['id']}", headers=bob.headers).status_code == 404
    assert client.delete(f"/api/v1/saved-filters/{urgent['id']}", headers=alice.headers).status_code == 200
    assert [f["name"] for f in client.get("/api/v1/saved-filters/", headers=alice.headers).json()] == ["all overdue"]

    assert client.post("/api/v1/saved-filters/", json={"name": "   ", "query": ""}, headers=alice.headers).status_code == 422
    assert client.get("/api/v1/saved-filters/").status_code == 401
