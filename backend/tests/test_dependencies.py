def post(client, user, url, **data):
    r = client.post(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def put(client, user, task_id, **data):
    return client.put(f"/api/tasks/{task_id}", json=data, headers=user.headers)


def test_blocked_by(client, alice):
    a = post(client, alice, "/api/tasks/", title="Get quote")
    b = post(client, alice, "/api/tasks/", title="Order", blocked_by_ids=[a["id"]])
    assert b["blocked_by_ids"] == [a["id"]]
    c = post(client, alice, "/api/tasks/", title="Install")
    r = put(client, alice, c["id"], blocked_by_ids=[b["id"], a["id"], b["id"]]).json()
    assert r["blocked_by_ids"] == [a["id"], b["id"]]  # deduplicated
    listed = {t["id"]: t for t in client.get("/api/tasks/", headers=alice.headers).json()}
    assert listed[c["id"]]["blocked_by_ids"] == [a["id"], b["id"]]
    # other updates leave them alone; [] clears
    assert put(client, alice, c["id"], priority=1).json()["blocked_by_ids"] == [a["id"], b["id"]]
    assert put(client, alice, c["id"], blocked_by_ids=[]).json()["blocked_by_ids"] == []
    # deleting a blocker removes the link
    client.delete(f"/api/tasks/{a['id']}", headers=alice.headers)
    assert client.get(f"/api/tasks/{b['id']}", headers=alice.headers).json()["blocked_by_ids"] == []


def test_no_self_no_cycles_no_unknown(client, alice):
    a = post(client, alice, "/api/tasks/", title="A")
    b = post(client, alice, "/api/tasks/", title="B", blocked_by_ids=[a["id"]])
    c = post(client, alice, "/api/tasks/", title="C", blocked_by_ids=[b["id"]])
    assert put(client, alice, a["id"], blocked_by_ids=[a["id"]]).status_code == 400
    r = put(client, alice, a["id"], blocked_by_ids=[c["id"]])  # A <- B <- C <- A
    assert r.status_code == 400 and "each other" in r.json()["detail"]
    assert put(client, alice, a["id"], blocked_by_ids=[999]).status_code == 400
    assert client.get(f"/api/tasks/{a['id']}", headers=alice.headers).json()["blocked_by_ids"] == []


def test_private_blockers_need_access(client, alice, bob):
    p = post(client, alice, "/api/projects/", name="Secret", is_private=True)
    hidden = post(client, alice, "/api/tasks/", title="hidden", project_id=p["id"])
    mine = post(client, bob, "/api/tasks/", title="bob's")
    assert put(client, bob, mine["id"], blocked_by_ids=[hidden["id"]]).status_code == 400


def test_unblocked_notification_and_history(client, alice, bob):
    a = post(client, alice, "/api/tasks/", title="Get quote")
    b = post(client, alice, "/api/tasks/", title="Order parts")
    c = post(client, alice, "/api/tasks/", title="Build it", assignee_id=bob.id, blocked_by_ids=[a["id"], b["id"]])
    client.post("/api/notifications/read", json={}, headers=bob.headers)

    put(client, alice, a["id"], status="done")  # b still open: nothing yet
    assert client.get("/api/notifications/", headers=bob.headers).json()["unread"] == 0
    put(client, alice, b["id"], status="done")
    n = client.get("/api/notifications/", headers=bob.headers).json()
    assert n["unread"] == 1
    item = n["items"][0]
    assert (item["kind"], item["task_id"], item["actor"], item["excerpt"]) == ("unblocked", c["id"], "alice", "Done: Order parts")
    # re-ticking doesn't notify again; bob finishing his own blocker doesn't notify him
    put(client, alice, b["id"], status="todo")
    put(client, bob, b["id"], status="done")
    assert client.get("/api/notifications/", headers=bob.headers).json()["unread"] == 1

    log = client.get(f"/api/tasks/{c['id']}/activity", headers=alice.headers).json()
    d = post(client, alice, "/api/tasks/", title="Test")
    put(client, alice, c["id"], blocked_by_ids=[a["id"], d["id"]])
    log = [(x["kind"], x["old_value"], x["new_value"]) for x in client.get(f"/api/tasks/{c['id']}/activity", headers=alice.headers).json()]
    assert ("blocked_by", "“Get quote”, “Order parts”", "“Get quote”, “Test”") in log
