"""Mind maps: CRUD, validation, visibility, sync and deletion records."""
import uuid

from sqlalchemy import text


def post(client, user, url, status=200, **data):
    r = client.post(url, json=data, headers=user.headers)
    assert r.status_code == status, r.text
    return r.json()


def sync(client, user, since=None):
    r = client.get("/api/v1/sync/", params={"since": since} if since else {}, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


NODES = [
    {"id": "a", "text": "Marketing", "side": "left", "color": "#ff9800"},
    {"id": "b", "parent": "a", "text": "Flyer", "note": "A5, two-sided"},
    {"id": "c", "text": "Website"},
]


def test_create_read_update_delete(client, alice):
    p = post(client, alice, "/api/v1/projects/", name="Launch")
    m = post(client, alice, "/api/v1/mindmaps/", project_id=p["id"], title="  Launch   ideas ", nodes=NODES)
    assert m["title"] == "Launch ideas" and m["node_count"] == 3 and m["created_by_id"] == alice.id
    assert m["nodes"][1] == {"id": "b", "parent": "a", "text": "Flyer", "note": "A5, two-sided",
                             "color": None, "side": None, "collapsed": False, "task_uid": None}

    listed = client.get("/api/v1/mindmaps/", params={"project_id": p["id"]}, headers=alice.headers).json()
    assert [x["id"] for x in listed] == [m["id"]] and "nodes" not in listed[0]

    task_uid = str(uuid.uuid4())
    nodes = NODES + [{"id": "d", "parent": "c", "text": "Contact form", "task_uid": task_uid}]
    r = client.put(f"/api/v1/mindmaps/{m['id']}", json={"nodes": nodes, "title": "Ideas"}, headers=alice.headers)
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Ideas" and r.json()["nodes"][-1]["task_uid"] == task_uid

    assert client.delete(f"/api/v1/mindmaps/{m['id']}", headers=alice.headers).json() == {"ok": True}
    assert client.get(f"/api/v1/mindmaps/{m['id']}", headers=alice.headers).status_code == 404


def test_uid_makes_create_idempotent(client, alice):
    p = post(client, alice, "/api/v1/projects/", name="P")
    uid = str(uuid.uuid4())
    a = post(client, alice, "/api/v1/mindmaps/", uid=uid, project_id=p["id"], title="M")
    b = post(client, alice, "/api/v1/mindmaps/", uid=uid, project_id=p["id"], title="M again")
    assert a["id"] == b["id"] and b["title"] == "M" and a["uid"] == uid


def test_invalid_trees_are_refused(client, alice):
    p = post(client, alice, "/api/v1/projects/", name="P")
    url = "/api/v1/mindmaps/"
    post(client, alice, url, 400, project_id=p["id"], title="M", nodes=[{"id": "a"}, {"id": "a"}])
    post(client, alice, url, 400, project_id=p["id"], title="M", nodes=[{"id": "a", "parent": "x"}])
    post(client, alice, url, 400, project_id=p["id"], title="M",
         nodes=[{"id": "a", "parent": "b"}, {"id": "b", "parent": "a"}])
    post(client, alice, url, 422, project_id=p["id"], title="M", nodes=[{"id": "bad id"}])
    post(client, alice, url, 400, project_id=999, title="M")
    # A side only means something on main branches
    m = post(client, alice, url, project_id=p["id"], title="M",
             nodes=[{"id": "a"}, {"id": "b", "parent": "a", "side": "left"}])
    assert m["nodes"][1]["side"] is None


def test_private_project_maps_are_hidden(client, alice, bob):
    p = post(client, alice, "/api/v1/projects/", name="Secret", is_private=True)
    m = post(client, alice, "/api/v1/mindmaps/", project_id=p["id"], title="M")
    assert client.get(f"/api/v1/mindmaps/{m['id']}", headers=bob.headers).status_code == 404
    assert client.get("/api/v1/mindmaps/", headers=bob.headers).json() == []
    assert client.put(f"/api/v1/mindmaps/{m['id']}", json={"title": "x"}, headers=bob.headers).status_code == 404
    assert sync(client, bob)["ids"]["mindmaps"] == []

    # Getting access sends the map to bob's next sync
    cursor = sync(client, bob)["cursor"]
    from app.database import engine
    with engine.begin() as c:
        c.execute(text("UPDATE mind_maps SET updated_at = now() - interval '1 hour'"))
    r = client.put(f"/api/v1/projects/{p['id']}", json={"member_ids": [alice.id, bob.id]}, headers=alice.headers)
    assert r.status_code == 200, r.text
    later = sync(client, bob, cursor)
    assert [x["id"] for x in later["mindmaps"]] == [m["id"]] and later["ids"]["mindmaps"] == [m["id"]]


def test_sync_and_deletions(client, alice):
    p = post(client, alice, "/api/v1/projects/", name="P")
    m = post(client, alice, "/api/v1/mindmaps/", project_id=p["id"], title="M", nodes=NODES)
    full = sync(client, alice)
    assert [x["title"] for x in full["mindmaps"]] == ["M"] and len(full["mindmaps"][0]["nodes"]) == 3
    assert full["ids"]["mindmaps"] == [m["id"]]

    from app.database import engine
    with engine.begin() as c:
        c.execute(text("UPDATE mind_maps SET updated_at = now() - interval '1 hour'"))
        c.execute(text("UPDATE projects SET updated_at = now() - interval '1 hour'"))
    cursor = full["cursor"]
    assert sync(client, alice, cursor)["mindmaps"] == []

    client.put(f"/api/v1/mindmaps/{m['id']}", json={"title": "N"}, headers=alice.headers)
    assert [x["title"] for x in sync(client, alice, cursor)["mindmaps"]] == ["N"]

    # Deleting the project takes its maps along and records it
    m2 = post(client, alice, "/api/v1/mindmaps/", project_id=p["id"], title="Other")
    assert client.delete(f"/api/v1/mindmaps/{m['id']}", headers=alice.headers).status_code == 200
    assert client.delete(f"/api/v1/projects/{p['id']}", headers=alice.headers).status_code == 200
    after = sync(client, alice, cursor)
    gone = {(d["entity"], d["id"]) for d in after["deletions"]}
    assert {("mindmap", m["id"]), ("mindmap", m2["id"]), ("project", p["id"])} <= gone
    assert after["ids"]["mindmaps"] == []
