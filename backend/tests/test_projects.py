PALETTE_FIRST = "#2196f3"


def create(client, user, **data):
    r = client.post("/api/projects/", json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_top_level_projects_get_distinct_colors(client, alice):
    a = create(client, alice, name="A")
    b = create(client, alice, name="B")
    c = create(client, alice, name="C", color="#123456")
    assert a["color"] == PALETTE_FIRST
    assert b["color"] not in (None, a["color"])
    assert c["color"] == "#123456"


def test_categories(client, alice):
    hub = create(client, alice, name="6GHub")
    cat = create(client, alice, name="Ordering", parent_id=hub["id"])
    assert cat["parent_id"] == hub["id"]
    assert cat["color"] is None  # inherits the parent's color in the UI


def test_category_rules(client, alice):
    hub = create(client, alice, name="6GHub")
    cat = create(client, alice, name="Ordering", parent_id=hub["id"])
    other = create(client, alice, name="Other")
    h = alice.headers
    # no nesting deeper than one level
    assert client.post("/api/projects/", json={"name": "x", "parent_id": cat["id"]}, headers=h).status_code == 400
    # not its own parent
    assert client.put(f"/api/projects/{hub['id']}", json={"parent_id": hub["id"]}, headers=h).status_code == 400
    # a project with categories can't become a category
    assert client.put(f"/api/projects/{hub['id']}", json={"parent_id": other["id"]}, headers=h).status_code == 400
    # unknown parent
    assert client.post("/api/projects/", json={"name": "x", "parent_id": 9999}, headers=h).status_code == 400


def test_invalid_color_rejected(client, alice):
    r = client.post("/api/projects/", json={"name": "x", "color": "red"}, headers=alice.headers)
    assert r.status_code == 422


def test_partial_update_keeps_other_fields(client, alice):
    p = create(client, alice, name="A", description="desc", color="#123456")
    r = client.put(f"/api/projects/{p['id']}", json={"name": "B"}, headers=alice.headers).json()
    assert (r["name"], r["description"], r["color"]) == ("B", "desc", "#123456")


def test_delete_project_removes_categories_keeps_tasks(client, alice):
    hub = create(client, alice, name="6GHub")
    cat = create(client, alice, name="Ordering", parent_id=hub["id"])
    t1 = client.post("/api/tasks/", json={"title": "on hub", "project_id": hub["id"]}, headers=alice.headers).json()
    t2 = client.post("/api/tasks/", json={"title": "in cat", "project_id": cat["id"]}, headers=alice.headers).json()
    assert client.delete(f"/api/projects/{hub['id']}", headers=alice.headers).status_code == 200
    assert client.get("/api/projects/", headers=alice.headers).json() == []
    for t in (t1, t2):
        assert client.get(f"/api/tasks/{t['id']}", headers=alice.headers).json()["project_id"] is None


def test_projects_require_login(client):
    assert client.get("/api/projects/").status_code == 401
