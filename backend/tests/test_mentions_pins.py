def post(client, user, url, **data):
    r = client.post(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def bell(client, user):
    return [(n["kind"], n["actor"]) for n in client.get("/api/v1/notifications/", headers=user.headers).json()["items"]]


# ---- @mentions -------------------------------------------------------------------

def test_mention_notifies_the_person_named(client, alice, bob, admin):
    task = post(client, alice, "/api/v1/tasks/", title="Order parts")
    post(client, alice, f"/api/v1/tasks/{task['id']}/comments", body="@BOB, can you check the quote? (not a@bob.de)")
    assert bell(client, bob) == [("mention", "alice")]
    assert bell(client, admin) == []  # not involved, not mentioned

    # bob answers: alice hears it as a comment (she commented before); mentioning himself does nothing
    post(client, bob, f"/api/v1/tasks/{task['id']}/comments", body="Done, @bob checked it.")
    assert bell(client, alice) == [("comment", "bob")]
    assert bell(client, bob) == [("mention", "alice")]


def test_editing_notifies_only_newly_mentioned(client, alice, bob, admin):
    task = post(client, alice, "/api/v1/tasks/", title="Plan")
    c = post(client, alice, f"/api/v1/tasks/{task['id']}/comments", body="Hi @bob")
    r = client.put(f"/api/v1/comments/{c['id']}", json={"body": "Hi @bob and @admin."}, headers=alice.headers)
    assert r.status_code == 200
    assert bell(client, bob) == [("mention", "alice")]  # not again
    assert bell(client, admin) == [("mention", "alice")]


def test_mentions_respect_private_projects(client, alice, bob):
    secret = post(client, alice, "/api/v1/projects/", name="Secret", is_private=True)
    task = post(client, alice, "/api/v1/tasks/", title="Hidden", project_id=secret["id"])
    post(client, alice, f"/api/v1/tasks/{task['id']}/comments", body="@bob look")
    assert bell(client, bob) == []  # can't see it, so no notification


# ---- pinned tasks -----------------------------------------------------------------

def test_pins_are_per_user(client, alice, bob):
    a = post(client, alice, "/api/v1/tasks/", title="A")
    b = post(client, alice, "/api/v1/tasks/", title="B")
    for t in (b, a, b):  # pinning twice is fine
        assert client.put(f"/api/v1/pins/{t['id']}", headers=alice.headers).status_code == 200
    assert client.get("/api/v1/pins/", headers=alice.headers).json() == [b["id"], a["id"]]  # oldest first
    assert client.get("/api/v1/pins/", headers=bob.headers).json() == []

    assert client.delete(f"/api/v1/pins/{b['id']}", headers=alice.headers).status_code == 200
    assert client.delete(f"/api/v1/pins/{b['id']}", headers=alice.headers).status_code == 200  # already gone: fine
    assert client.get("/api/v1/pins/", headers=alice.headers).json() == [a["id"]]

    # deleting the task removes its pins
    client.delete(f"/api/v1/tasks/{a['id']}", headers=alice.headers)
    assert client.get("/api/v1/pins/", headers=alice.headers).json() == []
    assert client.put("/api/v1/pins/99999", headers=alice.headers).status_code == 404


def test_pins_follow_what_you_can_see(client, alice, bob):
    secret = post(client, alice, "/api/v1/projects/", name="Secret", is_private=True, member_ids=[bob.id])
    task = post(client, alice, "/api/v1/tasks/", title="Members only", project_id=secret["id"])
    assert client.put(f"/api/v1/pins/{task['id']}", headers=bob.headers).status_code == 200
    client.put(f"/api/v1/projects/{secret['id']}", json={"member_ids": [alice.id]}, headers=alice.headers)
    assert client.get("/api/v1/pins/", headers=bob.headers).json() == []  # no longer a member
