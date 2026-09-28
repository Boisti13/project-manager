def post(client, user, url, **data):
    r = client.post(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def put(client, user, url, **data):
    r = client.put(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


# ---- archiving ---------------------------------------------------------------

def test_archive_and_restore_a_project(client, alice):
    p = post(client, alice, "/api/v1/projects/", name="Done project")
    cat = post(client, alice, "/api/v1/projects/", name="Part", parent_id=p["id"])
    assert p["archived_at"] is None

    archived = put(client, alice, f"/api/v1/projects/{p['id']}", archived=True)
    assert archived["archived_at"] is not None
    again = put(client, alice, f"/api/v1/projects/{p['id']}", archived=True)
    assert again["archived_at"] == archived["archived_at"]  # stays the first time
    r = client.put(f"/api/v1/projects/{cat['id']}", json={"archived": True}, headers=alice.headers)
    assert r.status_code == 400  # categories follow their project

    # still listed (the app hides it), and its tasks still exist
    listed = {x["id"]: x for x in client.get("/api/v1/projects/", headers=alice.headers).json()}
    assert listed[p["id"]]["archived_at"] is not None
    assert put(client, alice, f"/api/v1/projects/{p['id']}", archived=False)["archived_at"] is None


def test_calendar_feed_leaves_out_archived_projects(client, alice):
    p = post(client, alice, "/api/v1/projects/", name="Old")
    cat = post(client, alice, "/api/v1/projects/", name="Cat", parent_id=p["id"])
    parent = post(client, alice, "/api/v1/tasks/", title="In project", project_id=p["id"], deadline="2026-10-10T00:00:00")
    post(client, alice, "/api/v1/tasks/", title="Subtask", parent_task_id=parent["id"], deadline="2026-10-11T00:00:00")
    post(client, alice, "/api/v1/tasks/", title="In category", project_id=cat["id"], deadline="2026-10-12T00:00:00")
    post(client, alice, "/api/v1/tasks/", title="Elsewhere", deadline="2026-10-13T00:00:00")
    path = client.get("/api/v1/calendar/feed", headers=alice.headers).json()["path"]

    def summaries():
        return [line[8:] for line in client.get(path).text.replace("\r\n ", "").split("\r\n") if line.startswith("SUMMARY:")]

    assert len(summaries()) == 4
    put(client, alice, f"/api/v1/projects/{p['id']}", archived=True)
    assert summaries() == ["Elsewhere"]


# ---- share links -------------------------------------------------------------

def test_share_link_shows_the_project_read_only(client, alice, bob):
    lab = post(client, alice, "/api/v1/labels/", name="hardware", color="#795548")
    p = post(client, alice, "/api/v1/projects/", name="Lab setup", description="For the partners")
    cat = post(client, alice, "/api/v1/projects/", name="Ordering", parent_id=p["id"])
    top = post(client, alice, "/api/v1/tasks/", title="Order antennas", project_id=cat["id"], priority=2,
               estimate_minutes=90, label_ids=[lab["id"]], assignee_id=bob.id, description="**40** units")
    post(client, alice, "/api/v1/tasks/", title="Get quote", parent_task_id=top["id"], status="done")
    post(client, alice, f"/api/v1/tasks/{top['id']}/comments", body="internal note")
    other = post(client, alice, "/api/v1/projects/", name="Other")
    post(client, alice, "/api/v1/tasks/", title="Not shared", project_id=other["id"])

    shared = post(client, alice, f"/api/v1/projects/{p['id']}/share")
    token = shared["share_token"]
    assert token and post(client, alice, f"/api/v1/projects/{p['id']}/share")["share_token"] == token  # same link

    r = client.get(f"/api/v1/share/{token}")  # no login
    assert r.status_code == 200
    data = r.json()
    assert (data["name"], data["description"], data["archived"]) == ("Lab setup", "For the partners", False)
    assert [c["name"] for c in data["categories"]] == ["Ordering"]
    tasks = {t["title"]: t for t in data["tasks"]}
    assert set(tasks) == {"Order antennas", "Get quote"}
    t = tasks["Order antennas"]
    assert (t["project_id"], t["priority"], t["estimate_minutes"], t["description"]) == (cat["id"], 2, 90, "**40** units")
    assert t["labels"] == [{"name": "hardware", "color": "#795548"}]
    assert tasks["Get quote"]["parent_task_id"] == top["id"] and tasks["Get quote"]["status"] == "done"
    text = r.text
    assert "internal note" not in text and "bob" not in text and "assignee" not in text  # no comments, no people

    # categories can't be shared on their own; stopping makes the link dead
    assert client.post(f"/api/v1/projects/{cat['id']}/share", headers=alice.headers).status_code == 400
    assert client.delete(f"/api/v1/projects/{p['id']}/share", headers=alice.headers).json()["share_token"] is None
    assert client.get(f"/api/v1/share/{token}").status_code == 404
    assert client.get("/api/v1/share/nonsense").status_code == 404


def test_only_those_who_see_a_private_project_can_share_it(client, alice, bob):
    secret = post(client, alice, "/api/v1/projects/", name="Secret", is_private=True)
    assert client.post(f"/api/v1/projects/{secret['id']}/share", headers=bob.headers).status_code == 404
    token = post(client, alice, f"/api/v1/projects/{secret['id']}/share")["share_token"]
    assert client.get(f"/api/v1/share/{token}").json()["name"] == "Secret"
