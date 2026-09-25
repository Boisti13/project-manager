def new_task(client, user, **data):
    return client.post("/api/tasks/", json={"title": "t", **data}, headers=user.headers).json()


def comment(client, user, task_id, body):
    return client.post(f"/api/tasks/{task_id}/comments", json={"body": body}, headers=user.headers)


def test_add_list_and_count(client, alice, bob):
    t = new_task(client, alice)
    a = comment(client, alice, t["id"], "  first  ").json()
    comment(client, bob, t["id"], "second")
    assert a["author"] == "alice" and a["body"] == "first" and a["edited_at"] is None
    assert [c["author"] for c in client.get(f"/api/tasks/{t['id']}/comments", headers=bob.headers).json()] == ["alice", "bob"]
    counts = {x["id"]: x["comment_count"] for x in client.get("/api/tasks/", headers=alice.headers).json()}
    assert counts[t["id"]] == 2


def test_empty_and_unknown(client, alice):
    t = new_task(client, alice)
    assert comment(client, alice, t["id"], "   ").status_code == 400
    assert comment(client, alice, t["id"], "").status_code == 422
    assert comment(client, alice, 9999, "x").status_code == 404
    assert client.put("/api/comments/9999", json={"body": "x"}, headers=alice.headers).status_code == 404


def test_edit_only_own(client, alice, bob):
    t = new_task(client, alice)
    c = comment(client, alice, t["id"], "mine").json()
    assert client.put(f"/api/comments/{c['id']}", json={"body": "hacked"}, headers=bob.headers).status_code == 403
    r = client.put(f"/api/comments/{c['id']}", json={"body": "edited"}, headers=alice.headers).json()
    assert r["body"] == "edited" and r["edited_at"] is not None
    # unchanged text doesn't mark it edited again
    same = client.put(f"/api/comments/{c['id']}", json={"body": "edited"}, headers=alice.headers).json()
    assert same["edited_at"] == r["edited_at"]


def test_delete_own_or_admin(client, admin, alice, bob):
    t = new_task(client, alice)
    c1 = comment(client, alice, t["id"], "one").json()
    c2 = comment(client, alice, t["id"], "two").json()
    assert client.delete(f"/api/comments/{c1['id']}", headers=bob.headers).status_code == 403
    assert client.delete(f"/api/comments/{c1['id']}", headers=alice.headers).status_code == 200
    assert client.delete(f"/api/comments/{c2['id']}", headers=admin.headers).status_code == 200
    assert client.get(f"/api/tasks/{t['id']}/comments", headers=alice.headers).json() == []


def test_comments_deleted_with_task_and_subtasks(client, alice):
    from sqlalchemy import text
    from app.database import engine

    parent = new_task(client, alice)
    child = new_task(client, alice, parent_task_id=parent["id"])
    comment(client, alice, parent["id"], "p")
    comment(client, alice, child["id"], "c")
    client.delete(f"/api/tasks/{parent['id']}", headers=alice.headers)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM task_comments")).scalar() == 0


def test_search(client, alice):
    t1 = new_task(client, alice)
    t2 = new_task(client, alice)
    comment(client, alice, t1["id"], "Größe passt, 100% sure_ish")
    comment(client, alice, t2["id"], "nothing special")
    search = lambda q: client.get("/api/comments/search", params={"q": q}, headers=alice.headers).json()  # noqa: E731
    assert search("größe") == [t1["id"]]    # G/g: case-insensitive
    assert search("PASST") == [t1["id"]]
    assert search("100%") == [t1["id"]]
    assert search("e_i") == [t1["id"]]   # _ is literal, not a wildcard
    assert search("1_0") == []
    assert sorted(search("s")) == sorted([t1["id"], t2["id"]])
    assert search("   ") == []
