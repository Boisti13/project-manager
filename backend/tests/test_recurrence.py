from datetime import datetime, timedelta

import pytest

from app.recurrence import add_interval, next_deadline
from app.timeutil import utcnow


def task(client, user, **data):
    r = client.post("/api/tasks/", json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def tick(client, user, task_id, status="done"):
    r = client.put(f"/api/tasks/{task_id}", json={"status": status}, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def by_title(client, user, title):
    return [t for t in client.get("/api/tasks/", headers=user.headers).json() if t["title"] == title]


@pytest.mark.parametrize("start, unit, n, expected", [
    ("2026-01-31", "month", 1, "2026-02-28"),   # clamp to month end
    ("2028-01-31", "month", 1, "2028-02-29"),   # leap year
    ("2026-03-31", "month", 1, "2026-04-30"),
    ("2026-11-15", "month", 3, "2027-02-15"),   # across the year boundary
    ("2028-02-29", "year", 1, "2029-02-28"),
    ("2026-09-26", "week", 2, "2026-10-10"),
    ("2026-09-26", "day", 1, "2026-09-27"),
])
def test_add_interval(start, unit, n, expected):
    got = add_interval(datetime.fromisoformat(start), unit, n)
    assert got.date().isoformat() == expected


def test_next_deadline_skips_ahead_past_today():
    now = datetime(2026, 9, 26, 15, 0)
    # weekly task due 3 weeks ago: next is the first slot not before today
    assert next_deadline(datetime(2026, 9, 5), "week", 1, now) == datetime(2026, 9, 26)
    # no deadline: counted from today
    assert next_deadline(None, "day", 3, now) == datetime(2026, 9, 29)


def test_ticking_creates_the_next_occurrence(client, admin, alice):
    p = client.post("/api/projects/", json={"name": "Office"}, headers=alice.headers).json()["id"]
    due = (utcnow() + timedelta(days=2)).replace(hour=0, minute=0, second=0, microsecond=0)
    t = task(client, alice, title="Weekly sync", project_id=p, priority=2, assignee_id=alice.id,
             deadline=due.isoformat(), recurrence_unit="week", recurrence_interval=1)
    assert (t["recurrence_unit"], t["recurrence_interval"]) == ("week", 1)
    task(client, alice, title="Prepare agenda", parent_task_id=t["id"], project_id=p, status="done")

    tick(client, alice, t["id"])
    both = sorted(by_title(client, alice, "Weekly sync"), key=lambda x: x["id"])
    assert len(both) == 2
    old, new = both
    assert old["status"] == "done" and new["status"] == "todo"
    assert datetime.fromisoformat(new["deadline"]) == due + timedelta(weeks=1)
    assert (new["project_id"], new["priority"], new["assignee_id"], new["recurrence_unit"]) == (p, 2, alice.id, "week")
    # the checklist comes along, unticked
    subs = [x for x in client.get("/api/tasks/", headers=alice.headers).json() if x["parent_task_id"] == new["id"]]
    assert [(s["title"], s["status"]) for s in subs] == [("Prepare agenda", "todo")]


def test_no_duplicates_when_ticking_again(client, alice):
    t = task(client, alice, title="Water plants", recurrence_unit="day")
    assert t["recurrence_interval"] == 1  # unit alone means "every 1"
    tick(client, alice, t["id"])
    tick(client, alice, t["id"], status="todo")
    tick(client, alice, t["id"])
    assert len(by_title(client, alice, "Water plants")) == 2
    # if the next one was deleted, ticking again creates a new one
    nxt = max(by_title(client, alice, "Water plants"), key=lambda x: x["id"])
    client.delete(f"/api/tasks/{nxt['id']}", headers=alice.headers)
    tick(client, alice, t["id"], status="todo")
    tick(client, alice, t["id"])
    assert len(by_title(client, alice, "Water plants")) == 2


def test_non_repeating_and_stopping(client, alice):
    once = task(client, alice, title="Once")
    tick(client, alice, once["id"])
    assert len(by_title(client, alice, "Once")) == 1
    t = task(client, alice, title="Stop me", recurrence_unit="month", recurrence_interval=2)
    client.put(f"/api/tasks/{t['id']}", json={"recurrence_unit": None}, headers=alice.headers)
    after = tick(client, alice, t["id"])
    assert after["recurrence_unit"] is None and after["recurrence_interval"] is None
    assert len(by_title(client, alice, "Stop me")) == 1


def test_validation(client, alice):
    h = alice.headers
    assert client.post("/api/tasks/", json={"title": "x", "recurrence_unit": "hour"}, headers=h).status_code == 422
    assert client.post("/api/tasks/", json={"title": "x", "recurrence_unit": "day", "recurrence_interval": 0}, headers=h).status_code == 422


def test_created_as_done_spawns_right_away(client, alice):
    task(client, alice, title="Already done", status="done", recurrence_unit="week")
    assert sorted(t["status"] for t in by_title(client, alice, "Already done")) == ["done", "todo"]


def test_export_import_keeps_repeat(client, alice, bob):
    p = client.post("/api/projects/", json={"name": "R"}, headers=alice.headers).json()["id"]
    task(client, alice, title="Monthly report", project_id=p, recurrence_unit="month", recurrence_interval=1)
    exp = client.get("/api/transfer/export", params={"project_id": p}, headers=alice.headers).json()
    assert exp["projects"][0]["tasks"][0]["recurrence_unit"] == "month"
    client.post("/api/transfer/import", json=exp, headers=bob.headers)
    imported = max(by_title(client, bob, "Monthly report"), key=lambda x: x["id"])
    assert (imported["recurrence_unit"], imported["recurrence_interval"]) == ("month", 1)
