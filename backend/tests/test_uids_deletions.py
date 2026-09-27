import uuid
from datetime import datetime, timedelta

from sqlalchemy import text

from app.timeutil import utcnow


def post(client, user, url, **data):
    r = client.post(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def deletions(client, user, **params):
    r = client.get("/api/v1/deletions/", params=params, headers=user.headers)
    assert r.status_code == 200, r.text
    return [(d["entity"], d["id"], d["uid"]) for d in r.json()]


def sql(query, **params):
    from app.database import engine

    with engine.begin() as c:
        return c.execute(text(query), params)


def test_everything_has_a_uid(client, alice):
    p = post(client, alice, "/api/v1/projects/", name="P")
    t = post(client, alice, "/api/v1/tasks/", title="T", project_id=p["id"])
    c = post(client, alice, f"/api/v1/tasks/{t['id']}/comments", body="hi")
    lab = post(client, alice, "/api/v1/labels/", name="L")
    uids = [p["uid"], t["uid"], c["uid"], lab["uid"]]
    assert all(uuid.UUID(u) for u in uids) and len(set(uids)) == 4
    assert client.get(f"/api/v1/tasks/{t['id']}", headers=alice.headers).json()["uid"] == t["uid"]
    assert lab["updated_at"] is not None


def test_client_chosen_uids_are_idempotent(client, alice, bob):
    pu, tu, su, cu, lu = (str(uuid.uuid4()) for _ in range(5))
    p = post(client, alice, "/api/v1/projects/", name="Offline", uid=pu)
    assert p["uid"] == pu
    # created offline: the subtask refers to its parent and project by uid
    t = post(client, alice, "/api/v1/tasks/", title="Parent", uid=tu, project_uid=pu)
    s = post(client, alice, "/api/v1/tasks/", title="Child", uid=su, parent_task_uid=tu)
    assert (t["uid"], t["project_id"], s["parent_task_id"]) == (tu, p["id"], t["id"])
    # sending the same create again (retry after a lost response) returns the same thing
    again = post(client, alice, "/api/v1/tasks/", title="Parent", uid=tu, project_uid=pu)
    assert again["id"] == t["id"]
    assert len([x for x in client.get("/api/v1/tasks/", headers=alice.headers).json() if x["title"] == "Parent"]) == 1
    assert post(client, alice, "/api/v1/projects/", name="Offline", uid=pu)["id"] == p["id"]
    c1 = post(client, alice, f"/api/v1/tasks/{t['id']}/comments", body="x", uid=cu)
    assert post(client, alice, f"/api/v1/tasks/{t['id']}/comments", body="x", uid=cu)["id"] == c1["id"]
    l1 = post(client, alice, "/api/v1/labels/", name="offline", uid=lu)
    assert post(client, alice, "/api/v1/labels/", name="offline", uid=lu)["id"] == l1["id"]

    h = alice.headers
    assert client.post("/api/v1/tasks/", json={"title": "x", "uid": "not-a-uuid"}, headers=h).status_code == 422
    assert client.post("/api/v1/tasks/", json={"title": "x", "parent_task_uid": str(uuid.uuid4())}, headers=h).status_code == 400
    assert client.post("/api/v1/tasks/", json={"title": "x", "project_uid": str(uuid.uuid4())}, headers=h).status_code == 400
    # a uid someone else can't see isn't reusable
    secret = post(client, alice, "/api/v1/projects/", name="Secret", is_private=True)
    hidden = post(client, alice, "/api/v1/tasks/", title="hidden", project_id=secret["id"])
    r = client.post("/api/v1/tasks/", json={"title": "x", "uid": hidden["uid"]}, headers=bob.headers)
    assert r.status_code == 409


def test_deleting_leaves_records(client, alice):
    t = post(client, alice, "/api/v1/tasks/", title="Parent")
    s = post(client, alice, "/api/v1/tasks/", title="Child", parent_task_id=t["id"])
    c = post(client, alice, f"/api/v1/tasks/{s['id']}/comments", body="on the child")
    waiting = post(client, alice, "/api/v1/tasks/", title="Waiting", blocked_by_ids=[s["id"]])
    sql("UPDATE tasks SET updated_at = now() - interval '1 day' WHERE id = :i", i=waiting["id"])
    before = utcnow() - timedelta(seconds=5)

    assert client.delete(f"/api/v1/tasks/{t['id']}", headers=alice.headers).status_code == 200
    got = deletions(client, alice)
    assert set(got) == {("task", t["id"], t["uid"]), ("task", s["id"], s["uid"]), ("comment", c["id"], c["uid"])}
    # the task that waited for the child changed (its blocked_by_ids lost an entry)
    w = client.get(f"/api/v1/tasks/{waiting['id']}", headers=alice.headers).json()
    assert w["blocked_by_ids"] == [] and datetime.fromisoformat(w["updated_at"]) > before

    c2 = post(client, alice, f"/api/v1/tasks/{waiting['id']}/comments", body="bye")
    client.delete(f"/api/v1/comments/{c2['id']}", headers=alice.headers)
    assert ("comment", c2["id"], c2["uid"]) in deletions(client, alice)
    # since: only newer ones
    last = client.get("/api/v1/deletions/", headers=alice.headers).json()[-1]["deleted_at"]
    assert deletions(client, alice, since=last) == []
    assert client.get("/api/v1/deletions/").status_code == 401


def test_project_and_label_deletion_touch_their_tasks(client, alice):
    p = post(client, alice, "/api/v1/projects/", name="P")
    cat = post(client, alice, "/api/v1/projects/", name="C", parent_id=p["id"])
    lab = post(client, alice, "/api/v1/labels/", name="L")
    t = post(client, alice, "/api/v1/tasks/", title="in category", project_id=cat["id"], label_ids=[lab["id"]])
    sql("UPDATE tasks SET updated_at = now() - interval '1 day' WHERE id = :i", i=t["id"])
    before = utcnow() - timedelta(seconds=5)

    client.delete(f"/api/v1/labels/{lab['id']}", headers=alice.headers)
    after_label = client.get(f"/api/v1/tasks/{t['id']}", headers=alice.headers).json()
    assert after_label["label_ids"] == [] and datetime.fromisoformat(after_label["updated_at"]) > before

    sql("UPDATE tasks SET updated_at = now() - interval '1 day' WHERE id = :i", i=t["id"])
    client.delete(f"/api/v1/projects/{p['id']}", headers=alice.headers)
    after_project = client.get(f"/api/v1/tasks/{t['id']}", headers=alice.headers).json()
    assert after_project["project_id"] is None and datetime.fromisoformat(after_project["updated_at"]) > before
    assert {("project", p["id"], p["uid"]), ("project", cat["id"], cat["uid"]), ("label", lab["id"], lab["uid"])} <= set(
        deletions(client, alice))


def test_label_and_dependency_changes_bump_updated_at(client, alice):
    lab = post(client, alice, "/api/v1/labels/", name="L")
    t = post(client, alice, "/api/v1/tasks/", title="T")
    sql("UPDATE tasks SET updated_at = now() - interval '1 day' WHERE id = :i", i=t["id"])
    before = utcnow() - timedelta(seconds=5)
    r = client.put(f"/api/v1/tasks/{t['id']}", json={"label_ids": [lab["id"]]}, headers=alice.headers).json()
    assert datetime.fromisoformat(r["updated_at"]) > before
