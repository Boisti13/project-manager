from datetime import datetime

import pytest

from app.recurrence import Rule, next_deadline, next_occurrence

D = lambda s: datetime.fromisoformat(s)  # noqa: E731


@pytest.mark.parametrize("start, rule, expected", [
    # weekdays (0 = Monday); 28 Sep 2026 is a Monday
    ("2026-09-28", Rule("week", 1, (0, 3)), "2026-10-01"),       # Mon -> Thu
    ("2026-10-01", Rule("week", 1, (0, 3)), "2026-10-05"),       # Thu -> next Mon
    ("2026-10-01", Rule("week", 2, (0, 3)), "2026-10-12"),       # every 2 weeks: skip a week
    ("2026-10-02", Rule("week", 1, (0, 1, 2, 3, 4)), "2026-10-05"),  # workdays: Fri -> Mon
    ("2026-09-26", Rule("week", 1, (4,)), "2026-10-02"),         # Sat -> Fri
    # monthly modes
    ("2026-09-30", Rule("month", 1, monthly="last_day"), "2026-10-31"),
    ("2026-10-31", Rule("month", 1, monthly="last_day"), "2026-11-30"),
    ("2026-09-30", Rule("month", 1, monthly="last_workday"), "2026-10-30"),   # 31 Oct is a Saturday
    ("2026-10-01", Rule("month", 1, monthly="first_workday"), "2026-11-02"),  # 1 Nov is a Sunday
    ("2026-10-13", Rule("month", 1, monthly="weekday"), "2026-11-10"),        # 2nd Tuesday
    ("2026-10-29", Rule("month", 1, monthly="weekday"), "2026-11-26"),        # 5th Thursday -> last
    ("2026-10-30", Rule("month", 1, monthly="last_weekday"), "2026-11-27"),   # last Friday
    ("2026-10-13", Rule("month", 3, monthly="weekday"), "2027-01-12"),        # 2nd Tuesday, quarterly
    ("2028-02-29", Rule("year", 1, monthly="last_day"), "2029-02-28"),
    ("2026-01-31", Rule("month", 1), "2026-02-28"),                           # plain: clamped
])
def test_next_occurrence(start, rule, expected):
    assert next_occurrence(D(start), rule) == D(expected)


def test_counting_from_completion():
    now = datetime(2026, 9, 26, 15, 0)
    rule = Rule("day", 3, from_completion=True)
    # the old deadline doesn't matter, only when it was done
    assert next_deadline(D("2026-09-01"), rule, now, completed_at=now) == D("2026-09-29")
    assert next_deadline(D("2026-09-01"), Rule("day", 3), now) == D("2026-09-28")  # schedule: 1st, 4th, ... 28th
    weekly = Rule("week", 1, (0,), from_completion=True)
    assert next_deadline(None, weekly, now, completed_at=now) == D("2026-09-28")  # next Monday after Saturday


def post(client, user, **data):
    r = client.post("/api/v1/tasks/", json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_api_rules_and_next_occurrence(client, alice):
    h = alice.headers
    t = post(client, alice, title="Sync", deadline="2026-10-01T00:00:00", recurrence_unit="week",
             recurrence_weekdays=[3, 0, 3], recurrence_monthly="last_day", recurrence_from="schedule")
    # stored normalized: sorted weekdays, monthly mode dropped for weeks, "schedule" is the default
    assert (t["recurrence_weekdays"], t["recurrence_monthly"], t["recurrence_from"]) == ([0, 3], None, None)
    client.put(f"/api/v1/tasks/{t['id']}", json={"status": "done"}, headers=h)
    nxt = max((x for x in client.get("/api/v1/tasks/", headers=h).json() if x["title"] == "Sync"), key=lambda x: x["id"])
    assert nxt["deadline"].startswith("2026-10-05") and nxt["recurrence_weekdays"] == [0, 3]

    m = post(client, alice, title="Report", deadline="2026-10-30T00:00:00", recurrence_unit="month",
             recurrence_monthly="last_workday", recurrence_weekdays=[1])
    assert (m["recurrence_monthly"], m["recurrence_weekdays"]) == ("last_workday", None)
    log = client.get(f"/api/v1/tasks/{m['id']}/activity", headers=h).json()
    client.put(f"/api/v1/tasks/{m['id']}", json={"recurrence_from": "completion"}, headers=h)
    log = [a for a in client.get(f"/api/v1/tasks/{m['id']}/activity", headers=h).json() if a["kind"] == "recurrence"]
    assert (log[0]["old_value"], log[0]["new_value"]) == ("month:1;monthly=last_workday",
                                                          "month:1;monthly=last_workday;from=completion")
    # turning repeat off clears the refinements
    off = client.put(f"/api/v1/tasks/{m['id']}", json={"recurrence_unit": None}, headers=h).json()
    assert (off["recurrence_monthly"], off["recurrence_from"]) == (None, None)

    assert client.post("/api/v1/tasks/", json={"title": "x", "recurrence_unit": "week", "recurrence_weekdays": [7]},
                       headers=h).status_code == 422
    assert client.post("/api/v1/tasks/", json={"title": "x", "recurrence_unit": "month", "recurrence_monthly": "sometimes"},
                       headers=h).status_code == 422


def test_export_import_keeps_rules(client, alice, bob):
    p = client.post("/api/v1/projects/", json={"name": "R"}, headers=alice.headers).json()
    post(client, alice, title="Standup", project_id=p["id"], recurrence_unit="week", recurrence_weekdays=[0, 1, 2, 3, 4])
    exp = client.get("/api/v1/transfer/export", params={"project_id": p["id"]}, headers=alice.headers).json()
    assert exp["projects"][0]["tasks"][0]["recurrence_weekdays"] == [0, 1, 2, 3, 4]
    client.post("/api/v1/transfer/import", json=exp, headers=bob.headers)
    got = [t for t in client.get("/api/v1/tasks/", headers=bob.headers).json() if t["title"] == "Standup"]
    assert all(t["recurrence_weekdays"] == [0, 1, 2, 3, 4] for t in got) and len(got) == 2
