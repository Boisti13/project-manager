def post(client, user, url, **data):
    r = client.post(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def put(client, user, url, **data):
    return client.put(url, json=data, headers=user.headers)


def test_start_date_is_saved_checked_and_in_the_history(client, alice):
    t = post(client, alice, "/api/v1/tasks/", title="Build stand", start_date="2026-10-05T00:00:00",
             deadline="2026-10-09T00:00:00")
    assert t["start_date"].startswith("2026-10-05")
    # same day is fine, after the deadline isn't
    assert put(client, alice, f"/api/v1/tasks/{t['id']}", start_date="2026-10-09T00:00:00").status_code == 200
    r = put(client, alice, f"/api/v1/tasks/{t['id']}", start_date="2026-10-10T00:00:00")
    assert r.status_code == 400 and "after the deadline" in r.text
    r = put(client, alice, f"/api/v1/tasks/{t['id']}", deadline="2026-10-01T00:00:00")
    assert r.status_code == 400
    assert client.post("/api/v1/tasks/", json={"title": "x", "start_date": "2026-10-10T00:00:00",
                                               "deadline": "2026-10-01T00:00:00"}, headers=alice.headers).status_code == 400
    # a start without a deadline is allowed; clearing works
    assert put(client, alice, f"/api/v1/tasks/{t['id']}", deadline=None).status_code == 200
    assert put(client, alice, f"/api/v1/tasks/{t['id']}", start_date=None).json()["start_date"] is None
    kinds = [(a["kind"], a["old_value"], a["new_value"])
             for a in client.get(f"/api/v1/tasks/{t['id']}/activity", headers=alice.headers).json()]
    assert ("start", "2026-10-05", "2026-10-09") in kinds and ("start", "2026-10-09", None) in kinds


def test_repeating_tasks_move_their_start_along(client, alice):
    t = post(client, alice, "/api/v1/tasks/", title="Weekly report", start_date="2026-10-05T00:00:00",
             deadline="2026-10-07T00:00:00", recurrence_unit="week")
    post(client, alice, "/api/v1/tasks/", title="Collect numbers", parent_task_id=t["id"],
         start_date="2026-10-05T00:00:00", deadline="2026-10-06T00:00:00", estimate_minutes=30)
    put(client, alice, f"/api/v1/tasks/{t['id']}", status="done")
    tasks = client.get("/api/v1/tasks/", headers=alice.headers).json()
    nxt = [x for x in tasks if x["title"] == "Weekly report" and x["id"] != t["id"]][0]
    assert nxt["start_date"].startswith("2026-10-12") and nxt["deadline"].startswith("2026-10-14")
    sub = [x for x in tasks if x["parent_task_id"] == nxt["id"]][0]
    assert sub["start_date"].startswith("2026-10-12") and sub["estimate_minutes"] == 30


def test_calendar_feed_spans_start_to_deadline(client, alice):
    post(client, alice, "/api/v1/tasks/", title="Fair", start_date="2026-10-05T00:00:00", deadline="2026-10-08T00:00:00")
    path = client.get("/api/v1/calendar/feed", headers=alice.headers).json()["path"]
    text = client.get(path).text
    assert "DTSTART;VALUE=DATE:20261005" in text and "DTEND;VALUE=DATE:20261009" in text
