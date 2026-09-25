FORMAT = "project-manager/projects"


def test_settings_defaults_and_admin_only(client, admin, alice):
    assert client.get("/api/settings/", headers=alice.headers).json() == {"archive_after_days": 30, "backup_keep": 3}
    assert client.put("/api/settings/", json={"backup_keep": 5}, headers=alice.headers).status_code == 403
    r = client.put("/api/settings/", json={"backup_keep": 5}, headers=admin.headers).json()
    assert r == {"archive_after_days": 30, "backup_keep": 5}
    r = client.put("/api/settings/", json={"archive_after_days": 7}, headers=admin.headers).json()
    assert r == {"archive_after_days": 7, "backup_keep": 5}


def test_settings_validation(client, admin):
    for bad in ({"archive_after_days": 0}, {"archive_after_days": 5000}, {"backup_keep": 0}, {"backup_keep": 101}):
        assert client.put("/api/settings/", json=bad, headers=admin.headers).status_code == 422


def build_sample(client, user):
    h = user.headers
    P = lambda **kw: client.post("/api/projects/", json=kw, headers=h).json()["id"]  # noqa: E731
    T = lambda **kw: client.post("/api/tasks/", json=kw, headers=h).json()["id"]  # noqa: E731
    hub = P(name="6GHub", color="#123456")
    order = P(name="Ordering", parent_id=hub)
    P(name="Empty category", parent_id=hub)
    T(title="Kick-off", project_id=hub, status="in_progress", priority=2)
    mod = T(title="Order modules", project_id=order, description="Größe ✓", deadline="2026-09-20T00:00:00")
    T(title="Check quote", project_id=order, parent_task_id=mod, status="done")
    q = T(title="Confirm qty", project_id=order, parent_task_id=mod)
    T(title="Deep", project_id=order, parent_task_id=q)
    client.post(f"/api/tasks/{mod}/comments", json={"body": "3 weeks lead time"}, headers=h)
    T(title="No project task")
    return hub


def count_tasks(items):
    return sum(1 + count_tasks(t["subtasks"]) for t in items)


def test_export_structure(client, alice):
    hub = build_sample(client, alice)
    one = client.get("/api/transfer/export", params={"project_id": hub}, headers=alice.headers).json()
    assert one["format"] == FORMAT and one["unassigned_tasks"] == []
    p = one["projects"][0]
    assert (p["name"], p["color"]) == ("6GHub", "#123456")
    assert [c["name"] for c in p["categories"]] == ["Empty category", "Ordering"]
    mod = p["categories"][1]["tasks"][0]
    assert mod["comments"][0]["author"] == "alice"
    assert mod["subtasks"][1]["subtasks"][0]["title"] == "Deep"
    everything = client.get("/api/transfer/export", headers=alice.headers).json()
    assert [t["title"] for t in everything["unassigned_tasks"]] == ["No project task"]


def test_export_only_top_level_ids(client, alice):
    hub = build_sample(client, alice)
    cat = [p for p in client.get("/api/projects/", headers=alice.headers).json() if p["parent_id"] == hub][0]
    assert client.get("/api/transfer/export", params={"project_id": cat["id"]}, headers=alice.headers).status_code == 404


def test_import_roundtrip_and_renaming(client, alice, bob):
    build_sample(client, alice)
    exp = client.get("/api/transfer/export", headers=alice.headers).json()
    r = client.post("/api/transfer/import", json=exp, headers=bob.headers).json()
    assert r["renamed"] == [{"from": "6GHub", "to": "6GHub (2)"}]
    assert (r["projects"], r["categories"], r["tasks"], r["comments"]) == (1, 2, 6, 1)
    again = client.post("/api/transfer/import", json=exp, headers=bob.headers).json()
    assert again["renamed"][0]["to"] == "6GHub (3)"
    tasks = client.get("/api/tasks/", headers=bob.headers).json()
    assert all(t["assignee_id"] is None for t in tasks)
    done = [t for t in tasks if t["title"] == "Check quote"]
    assert all(t["completed_at"] for t in done)


def test_imported_comments_keep_author_name_but_are_not_editable(client, alice, bob):
    build_sample(client, alice)
    exp = client.get("/api/transfer/export", headers=alice.headers).json()
    client.post("/api/transfer/import", json=exp, headers=bob.headers)
    imported = [t for t in client.get("/api/tasks/", headers=bob.headers).json()
                if t["title"] == "Order modules" and t["comment_count"]]
    newest = max(imported, key=lambda t: t["id"])
    c = client.get(f"/api/tasks/{newest['id']}/comments", headers=bob.headers).json()[0]
    assert (c["author"], c["author_id"]) == ("alice", None)
    assert client.put(f"/api/comments/{c['id']}", json={"body": "x"}, headers=alice.headers).status_code == 403


def test_import_validation(client, alice):
    h = alice.headers
    assert client.post("/api/transfer/import", json={"format": "other", "version": 1}, headers=h).status_code == 422
    assert client.post("/api/transfer/import", json={"format": FORMAT, "version": 2}, headers=h).status_code == 422
    bad_task = {"format": FORMAT, "version": 1, "projects": [{"name": "x", "tasks": [{"title": ""}]}]}
    assert client.post("/api/transfer/import", json=bad_task, headers=h).status_code == 422
    # older files without "comments" still work
    old = {"format": FORMAT, "version": 1, "projects": [{"name": "Old", "tasks": [{"title": "t"}]}]}
    assert client.post("/api/transfer/import", json=old, headers=h).json()["tasks"] == 1
