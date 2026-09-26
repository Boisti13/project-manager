def post(client, user, url, **data):
    r = client.post(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_label_crud(client, alice, bob):
    a = post(client, alice, "/api/labels/", name="urgent")
    assert a["color"].startswith("#") and a["task_count"] == 0
    b = post(client, alice, "/api/labels/", name="  waiting   for supplier ", color="#123456")
    assert (b["name"], b["color"]) == ("waiting for supplier", "#123456")
    assert a["color"] != post(client, alice, "/api/labels/", name="third")["color"]  # next palette color
    # names are unique, ignoring case
    r = client.post("/api/labels/", json={"name": "URGENT"}, headers=bob.headers)
    assert r.status_code == 400 and "already exists" in r.json()["detail"]
    assert client.post("/api/labels/", json={"name": "x", "color": "red"}, headers=bob.headers).status_code == 422
    r = client.put(f"/api/labels/{a['id']}", json={"name": "Urgent", "color": "#ff0000"}, headers=bob.headers)
    assert r.json()["name"] == "Urgent" and r.json()["color"] == "#ff0000"
    assert client.put(f"/api/labels/{a['id']}", json={"name": "third"}, headers=bob.headers).status_code == 400
    names = [l["name"] for l in client.get("/api/labels/", headers=bob.headers).json()]
    assert names == ["third", "Urgent", "waiting for supplier"]
    assert client.get("/api/labels/").status_code == 401


def test_labels_on_tasks(client, alice):
    h = alice.headers
    u = post(client, alice, "/api/labels/", name="urgent")
    w = post(client, alice, "/api/labels/", name="waiting")
    t = post(client, alice, "/api/tasks/", title="Order", label_ids=[u["id"]])
    assert t["label_ids"] == [u["id"]]
    assert client.post("/api/tasks/", json={"title": "x", "label_ids": [999]}, headers=h).status_code == 400

    r = client.put(f"/api/tasks/{t['id']}", json={"label_ids": [w["id"], u["id"]]}, headers=h).json()
    assert sorted(r["label_ids"]) == sorted([u["id"], w["id"]])
    # other updates leave labels alone
    assert sorted(client.put(f"/api/tasks/{t['id']}", json={"priority": 2}, headers=h).json()["label_ids"]) == \
        sorted([u["id"], w["id"]])
    listed = [x for x in client.get("/api/tasks/", headers=h).json() if x["id"] == t["id"]][0]
    assert sorted(listed["label_ids"]) == sorted([u["id"], w["id"]])
    assert {l["name"]: l["task_count"] for l in client.get("/api/labels/", headers=h).json()} == {"urgent": 1, "waiting": 1}

    log = client.get(f"/api/tasks/{t['id']}/activity", headers=h).json()
    assert [(a["kind"], a["old_value"], a["new_value"]) for a in log if a["kind"] == "labels"] == \
        [("labels", "urgent", "urgent, waiting")]

    # deleting a label takes it off its tasks
    client.delete(f"/api/labels/{w['id']}", headers=h)
    assert client.get(f"/api/tasks/{t['id']}", headers=h).json()["label_ids"] == [u["id"]]


def test_bulk_and_repeat_keep_labels(client, alice):
    h = alice.headers
    u = post(client, alice, "/api/labels/", name="weekly")
    r = post(client, alice, "/api/tasks/bulk", items=[{"title": "A", "children": [{"title": "A1"}]}], label_ids=[u["id"]])
    for tid in r["ids"]:
        assert client.get(f"/api/tasks/{tid}", headers=h).json()["label_ids"] == [u["id"]]
    t = post(client, alice, "/api/tasks/", title="Sync", recurrence_unit="week", label_ids=[u["id"]])
    post(client, alice, "/api/tasks/", title="Agenda", parent_task_id=t["id"], label_ids=[u["id"]])
    client.put(f"/api/tasks/{t['id']}", json={"status": "done"}, headers=h)
    tasks = client.get("/api/tasks/", headers=h).json()
    nxt = max((x for x in tasks if x["title"] == "Sync"), key=lambda x: x["id"])
    sub = [x for x in tasks if x["parent_task_id"] == nxt["id"]][0]
    assert nxt["label_ids"] == [u["id"]] and sub["label_ids"] == [u["id"]]


def test_export_import_labels(client, alice, bob):
    p = post(client, alice, "/api/projects/", name="P")
    u = post(client, alice, "/api/labels/", name="Urgent", color="#ff0000")
    post(client, alice, "/api/tasks/", title="t", project_id=p["id"], label_ids=[u["id"]])
    exp = client.get("/api/transfer/export", params={"project_id": p["id"]}, headers=alice.headers).json()
    assert exp["projects"][0]["tasks"][0]["labels"] == ["Urgent"]
    assert exp["labels"] == [{"name": "Urgent", "color": "#ff0000"}]
    # matched by name, ignoring case; unknown ones are created with the exported color
    client.put(f"/api/labels/{u['id']}", json={"name": "urgent"}, headers=alice.headers)
    exp["projects"][0]["tasks"][0]["labels"] = ["URGENT", "New one", "new one"]
    exp["labels"].append({"name": "New one", "color": "#00ff00"})
    client.post("/api/transfer/import", json=exp, headers=bob.headers)
    labels = {l["name"]: l for l in client.get("/api/labels/", headers=bob.headers).json()}
    assert set(labels) == {"urgent", "New one"} and labels["New one"]["color"] == "#00ff00"
    imported = max((t for t in client.get("/api/tasks/", headers=bob.headers).json() if t["title"] == "t"), key=lambda t: t["id"])
    assert sorted(imported["label_ids"]) == sorted([labels["urgent"]["id"], labels["New one"]["id"]])
