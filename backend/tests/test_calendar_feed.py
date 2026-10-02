from app.calendar_feed import fold


def post(client, user, url, **data):
    r = client.post(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def feed_path(client, user):
    r = client.get("/api/v1/calendar/feed", headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()["path"]


def events(text):
    """Unfold lines and return the VEVENTs as dicts (property name -> value)."""
    assert text.startswith("BEGIN:VCALENDAR\r\n") and text.endswith("END:VCALENDAR\r\n")
    lines = text.replace("\r\n ", "").split("\r\n")
    out, current = [], None
    for line in lines:
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT":
            out.append(current)
            current = None
        elif current is not None and ":" in line:
            key, value = line.split(":", 1)
            current[key.split(";")[0]] = value
    return out


def get_feed(client, path, **params):
    r = client.get(path, params=params, headers={"Host": "pm.test"})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/calendar")
    return r.text


def test_feed_contents_and_scopes(client, alice, bob):
    p = post(client, alice, "/api/v1/projects/", name="6GHub")
    cat = post(client, alice, "/api/v1/projects/", name="Ordering", parent_id=p["id"])
    lab = post(client, alice, "/api/v1/labels/", name="urgent")
    mine = post(client, alice, "/api/v1/tasks/", title="Order cables, 40 m; blue", project_id=cat["id"],
                deadline="2026-10-13T00:00:00", assignee_id=alice.id, priority=3, label_ids=[lab["id"]],
                description="line one\nline two")
    post(client, alice, "/api/v1/tasks/", title="Sub step", parent_task_id=mine["id"], deadline="2026-10-12T00:00:00")
    post(client, alice, "/api/v1/tasks/", title="Nobody's", deadline="2026-10-14T00:00:00")
    post(client, alice, "/api/v1/tasks/", title="Bob's", deadline="2026-10-15T00:00:00", assignee_id=bob.id)
    post(client, alice, "/api/v1/tasks/", title="No deadline")
    done = post(client, alice, "/api/v1/tasks/", title="Finished", deadline="2026-10-16T00:00:00")
    client.put(f"/api/v1/tasks/{done['id']}", json={"status": "done"}, headers=alice.headers)

    path = feed_path(client, alice)
    assert path.startswith("/api/v1/calendar/") and path.endswith(".ics")
    assert feed_path(client, alice) == path  # stable until reset

    ev = {e["SUMMARY"]: e for e in events(get_feed(client, path))}
    # mine = assigned to me or nobody; open, with a deadline
    assert set(ev) == {"Order cables\\, 40 m\\; blue", "Sub step (Order cables\\, 40 m\\; blue)", "Nobody's"}
    e = ev["Order cables\\, 40 m\\; blue"]
    assert (e["DTSTART"], e["DTEND"]) == ("20261013", "20261014")
    assert e["UID"] == f"{mine['uid']}@project-manager"
    assert e["URL"] == f"http://pm.test/?task={mine['id']}" and e["CATEGORIES"] == "urgent"
    assert "Project: 6GHub / Ordering" in e["DESCRIPTION"] and "Priority: Critical" in e["DESCRIPTION"]
    assert "line one\\nline two" in e["DESCRIPTION"]
    assert "Project: 6GHub / Ordering" in ev["Sub step (Order cables\\, 40 m\\; blue)"]["DESCRIPTION"]

    everything = {e["SUMMARY"] for e in events(get_feed(client, path, scope="all"))}
    assert "Bob's" in everything and "Finished" not in everything and "No deadline" not in everything
    assert client.get(path, params={"scope": "nonsense"}).status_code == 422


def test_private_projects_and_language(client, alice, bob):
    secret = post(client, alice, "/api/v1/projects/", name="Secret", is_private=True)
    post(client, alice, "/api/v1/tasks/", title="hidden", project_id=secret["id"], deadline="2026-10-13T00:00:00")
    assert events(get_feed(client, feed_path(client, bob), scope="all")) == []
    client.put("/api/v1/auth/me/preferences", json={"language": "de"}, headers=alice.headers)
    e = events(get_feed(client, feed_path(client, alice)))[0]
    assert "Projekt: Secret" in e["DESCRIPTION"] and "Öffnen:" in e["DESCRIPTION"]


def test_repeating_tasks_become_series(client, alice):
    def rule(**data):
        t = post(client, alice, "/api/v1/tasks/", title=data.pop("title"), **data)
        return {e["SUMMARY"]: e for e in events(get_feed(client, feed_path(client, alice)))}[t["title"]].get("RRULE")

    assert rule(title="a", deadline="2026-10-01T00:00:00", recurrence_unit="week",
                recurrence_weekdays=[0, 3]) == "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TH"
    assert rule(title="b", deadline="2026-10-30T00:00:00", recurrence_unit="month",
                recurrence_monthly="last_workday") == "FREQ=MONTHLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1"
    assert rule(title="c", deadline="2026-10-13T00:00:00", recurrence_unit="month", recurrence_interval=3,
                recurrence_monthly="weekday") == "FREQ=MONTHLY;INTERVAL=3;BYDAY=2TU"
    assert rule(title="d", deadline="2026-10-29T00:00:00", recurrence_unit="month",
                recurrence_monthly="weekday") == "FREQ=MONTHLY;INTERVAL=1;BYDAY=-1TH"  # 5th -> last
    assert rule(title="e", deadline="2026-10-31T00:00:00", recurrence_unit="month") == "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=-1"
    assert rule(title="f", deadline="2026-02-28T00:00:00", recurrence_unit="year",
                recurrence_monthly="last_day") == "FREQ=YEARLY;INTERVAL=1;BYMONTH=2;BYMONTHDAY=-1"
    assert rule(title="g", deadline="2026-10-01T00:00:00", recurrence_unit="day", recurrence_interval=3) == \
        "FREQ=DAILY;INTERVAL=3"
    # counted from completion: can't be known upfront, so a single event
    assert rule(title="h", deadline="2026-10-01T00:00:00", recurrence_unit="day", recurrence_from="completion") is None


def test_reset_and_unknown(client, admin, alice):
    old = feed_path(client, alice)
    new = client.post("/api/v1/calendar/feed/reset", headers=alice.headers).json()["path"]
    assert new != old
    assert client.get(old).status_code == 404 and client.get(new).status_code == 200
    assert client.get("/api/v1/calendar/feed").status_code == 401  # managing it needs a login
    client.put(f"/api/users/{alice.id}", json={"is_active": False}, headers=admin.headers)
    assert client.get(new).status_code == 404  # deactivated users' feeds stop


def test_long_lines_are_folded_without_splitting_characters():
    line = "SUMMARY:" + "Ü" * 60
    folded = fold(line)
    assert all(len(part.encode("utf-8")) <= 75 for part in folded.split("\r\n"))
    assert folded.replace("\r\n ", "") == line


def test_feed_per_workspace(client, alice, bob):
    work = post(client, alice, "/api/v1/workspaces/", name="Work")
    office = post(client, alice, "/api/v1/projects/", name="Office")
    garden = post(client, alice, "/api/v1/projects/", name="Garden")
    loose = post(client, alice, "/api/v1/projects/", name="Loose")
    client.put(f"/api/v1/workspaces/projects/{office['id']}", json={"workspace_id": work["id"]}, headers=alice.headers)
    home = post(client, alice, "/api/v1/workspaces/", name="Home")
    client.put(f"/api/v1/workspaces/projects/{garden['id']}", json={"workspace_id": home["id"]}, headers=alice.headers)
    report = post(client, alice, "/api/v1/tasks/", title="Report", project_id=office["id"], deadline="2026-10-05T00:00:00")
    post(client, alice, "/api/v1/tasks/", title="Report draft", parent_task_id=report["id"], deadline="2026-10-04T00:00:00")
    post(client, alice, "/api/v1/tasks/", title="Mow", project_id=garden["id"], deadline="2026-10-06T00:00:00")
    post(client, alice, "/api/v1/tasks/", title="Loose end", project_id=loose["id"], deadline="2026-10-07T00:00:00")
    path = feed_path(client, alice)

    titles = lambda **p: sorted(e["SUMMARY"] for e in events(get_feed(client, path, **p)))
    assert titles() == ["Loose end", "Mow", "Report", "Report draft (Report)"]
    assert titles(workspace=work["id"]) == ["Loose end", "Report", "Report draft (Report)"]  # subtasks follow; unfiled too
    assert "X-WR-CALNAME:Project Manager (alice · Work)" in get_feed(client, path, workspace=work["id"])
    client.put("/api/v1/workspaces/settings", json={"unassigned_everywhere": False}, headers=alice.headers)
    assert titles(workspace=work["id"]) == ["Report", "Report draft (Report)"]

    # someone else's workspace, or one that's gone: unknown
    bobs = post(client, bob, "/api/v1/workspaces/", name="Bob's")
    assert client.get(path, params={"workspace": bobs["id"]}).status_code == 404
    client.delete(f"/api/v1/workspaces/{home['id']}", headers=alice.headers)
    assert client.get(path, params={"workspace": home["id"]}).status_code == 404
