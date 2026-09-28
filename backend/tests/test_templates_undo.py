def post(client, user, url, **data):
    r = client.post(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def put(client, user, url, **data):
    r = client.put(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def tasks(client, user):
    return client.get("/api/v1/tasks/", headers=user.headers).json()


# ---- templates ---------------------------------------------------------------

def test_save_and_use_template(client, alice, bob):
    lab = post(client, alice, "/api/v1/labels/", name="hardware")
    gone = post(client, alice, "/api/v1/labels/", name="temporary")
    p = post(client, alice, "/api/v1/projects/", name="Lab")
    root = post(client, alice, "/api/v1/tasks/", title="Order hardware", project_id=p["id"], priority=2,
                estimate_minutes=60, label_ids=[lab["id"], gone["id"]], description="Steps",
                deadline="2026-10-01T00:00:00", assignee_id=alice.id)
    a = post(client, alice, "/api/v1/tasks/", title="Get quote", parent_task_id=root["id"], estimate_minutes=30,
             status="done")
    post(client, alice, "/api/v1/tasks/", title="Ask supplier", parent_task_id=a["id"])
    post(client, alice, "/api/v1/tasks/", title="Place order", parent_task_id=root["id"])

    tpl = post(client, alice, "/api/v1/templates/", name="  Order   hardware ", task_id=root["id"])
    assert tpl["name"] == "Order hardware" and tpl["task_count"] == 4 and tpl["created_by"] == "alice"
    assert [s["title"] for s in tpl["tree"]["subtasks"]] == ["Get quote", "Place order"]
    assert tpl["tree"]["subtasks"][0]["subtasks"][0]["title"] == "Ask supplier"
    # names are unique, ignoring case
    r = client.post("/api/v1/templates/", json={"name": "order HARDWARE", "task_id": root["id"]}, headers=bob.headers)
    assert r.status_code == 409
    assert [t["name"] for t in client.get("/api/v1/templates/", headers=bob.headers).json()] == ["Order hardware"]

    client.delete(f"/api/v1/labels/{gone['id']}", headers=alice.headers)
    other = post(client, bob, "/api/v1/projects/", name="Office")
    res = post(client, bob, f"/api/v1/templates/{tpl['id']}/use", project_id=other["id"], title="Order screens",
               deadline="2026-11-02T00:00:00", assignee_id=alice.id)
    assert res["created"] == 4
    new = {t["id"]: t for t in tasks(client, bob) if t["id"] in res["ids"]}
    top = new[res["ids"][0]]
    assert (top["title"], top["status"], top["priority"], top["estimate_minutes"], top["label_ids"]) == \
        ("Order screens", "todo", 2, 60, [lab["id"]])
    assert top["deadline"].startswith("2026-11-02") and top["project_id"] == other["id"]
    assert all(t["status"] == "todo" and t["assignee_id"] == alice.id for t in new.values())
    kids = sorted((t for t in new.values() if t["parent_task_id"] == top["id"]), key=lambda t: t["order"])
    assert [(k["title"], k["deadline"]) for k in kids] == [("Get quote", None), ("Place order", None)]
    # alice got one notification for the whole lot
    notes = client.get("/api/v1/notifications/", headers=alice.headers).json()["items"]
    assert len([n for n in notes if n["kind"] == "assigned"]) == 1

    # as subtasks of an existing task
    res2 = post(client, alice, f"/api/v1/templates/{tpl['id']}/use", parent_task_id=root["id"])
    first = [t for t in tasks(client, alice) if t["id"] == res2["ids"][0]][0]
    assert first["parent_task_id"] == root["id"] and first["title"] == "Order hardware"

    # only the one who saved it (or an admin) deletes it
    assert client.delete(f"/api/v1/templates/{tpl['id']}", headers=bob.headers).status_code == 403
    assert client.delete(f"/api/v1/templates/{tpl['id']}", headers=alice.headers).status_code == 200
    assert client.post(f"/api/v1/templates/{tpl['id']}/use", json={}, headers=alice.headers).status_code == 404


def test_template_respects_private_projects(client, alice, bob):
    secret = post(client, alice, "/api/v1/projects/", name="Secret", is_private=True)
    hidden = post(client, alice, "/api/v1/tasks/", title="hidden", project_id=secret["id"])
    assert client.post("/api/v1/templates/", json={"name": "x", "task_id": hidden["id"]},
                       headers=bob.headers).status_code == 404
    tpl = post(client, alice, "/api/v1/templates/", name="x", task_id=hidden["id"])
    r = client.post(f"/api/v1/templates/{tpl['id']}/use", json={"project_id": secret["id"]}, headers=bob.headers)
    assert r.status_code == 400
    r = client.post(f"/api/v1/templates/{tpl['id']}/use", json={"project_id": secret["id"], "assignee_id": bob.id},
                    headers=alice.headers)
    assert r.status_code == 400  # bob can't see the project


# ---- undoing a repeating task's completion --------------------------------------

def test_reopening_takes_back_untouched_next_occurrence(client, alice):
    t = post(client, alice, "/api/v1/tasks/", title="Water plants", recurrence_unit="week",
             deadline="2026-10-01T00:00:00")
    post(client, alice, "/api/v1/tasks/", title="Fill can", parent_task_id=t["id"])
    put(client, alice, f"/api/v1/tasks/{t['id']}", status="done")
    nxt = [x for x in tasks(client, alice) if x["title"] == "Water plants" and x["id"] != t["id"]][0]
    assert len([x for x in tasks(client, alice) if x["title"] == "Fill can"]) == 2

    put(client, alice, f"/api/v1/tasks/{t['id']}", status="in_progress")
    titles = [x["title"] for x in tasks(client, alice)]
    assert titles.count("Water plants") == 1 and titles.count("Fill can") == 1
    deleted = client.get("/api/v1/deletions/", params={"since": "2000-01-01T00:00:00"}, headers=alice.headers).json()
    assert nxt["id"] in {d["id"] for d in deleted if d["entity"] == "task"}  # offline apps learn about it

    # ticked again: a fresh next one
    put(client, alice, f"/api/v1/tasks/{t['id']}", status="done")
    assert [x["title"] for x in tasks(client, alice)].count("Water plants") == 2


def test_reopening_keeps_a_next_occurrence_someone_worked_on(client, alice):
    t = post(client, alice, "/api/v1/tasks/", title="Report", recurrence_unit="week", deadline="2026-10-01T00:00:00")
    put(client, alice, f"/api/v1/tasks/{t['id']}", status="done")
    nxt = [x for x in tasks(client, alice) if x["title"] == "Report" and x["id"] != t["id"]][0]
    post(client, alice, f"/api/v1/tasks/{nxt['id']}/comments", body="started on it")
    put(client, alice, f"/api/v1/tasks/{t['id']}", status="todo")
    assert [x["title"] for x in tasks(client, alice)].count("Report") == 2
    put(client, alice, f"/api/v1/tasks/{t['id']}", status="done")  # no third one
    assert [x["title"] for x in tasks(client, alice)].count("Report") == 2

    t2 = post(client, alice, "/api/v1/tasks/", title="Invoice", recurrence_unit="month", deadline="2026-10-01T00:00:00")
    put(client, alice, f"/api/v1/tasks/{t2['id']}", status="done")
    nxt2 = [x for x in tasks(client, alice) if x["title"] == "Invoice" and x["id"] != t2["id"]][0]
    put(client, alice, f"/api/v1/tasks/{nxt2['id']}", priority=3)  # edited
    put(client, alice, f"/api/v1/tasks/{t2['id']}", status="todo")
    assert [x["title"] for x in tasks(client, alice)].count("Invoice") == 2
