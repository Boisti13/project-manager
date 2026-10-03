"""Home Assistant: the summary to poll, and MQTT (with a fake broker client)."""
import json
from datetime import datetime, timedelta

import pytest

from app import mqtt


def post(client, user, url, **data):
    r = client.post(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def day(offset):
    return (datetime.now().date() + timedelta(days=offset)).isoformat() + "T00:00:00"


# ---- polling: GET /summary ---------------------------------------------------------

def test_summary_counts_and_lists(client, alice, bob):
    p = post(client, alice, "/api/v1/projects/", name="Lab")
    post(client, alice, "/api/v1/tasks/", title="Late", project_id=p["id"], deadline=day(-2), priority=2)
    post(client, alice, "/api/v1/tasks/", title="Today", project_id=p["id"], deadline=day(0))
    post(client, alice, "/api/v1/tasks/", title="Soon", deadline=day(2), assignee_id=alice.id)
    post(client, alice, "/api/v1/tasks/", title="Later", deadline=day(10))
    post(client, alice, "/api/v1/tasks/", title="Bobs", deadline=day(-1), assignee_id=bob.id)
    post(client, alice, "/api/v1/tasks/", title="Done", deadline=day(-1), status="done")
    post(client, bob, "/api/v1/tasks/", title="For alice", assignee_id=alice.id)  # a notification

    s = client.get("/api/v1/summary/", headers=alice.headers).json()
    assert (s["overdue"], s["due_today"], s["due_soon"], s["open_assigned"]) == (1, 1, 1, 2)
    assert s["unread_notifications"] == 1 and s["latest_notification"]["task_title"] == "For alice"
    assert s["latest_notification"]["actor"] == "bob"
    late = s["overdue_tasks"][0]
    assert (late["title"], late["project"], late["priority"], late["overdue"]) == ("Late", "Lab", 2, True)
    assert late["url"].endswith(f"/?task={late['id']}")
    assert [t["title"] for t in s["due_today_tasks"]] == ["Today"]
    assert [t["title"] for t in s["due_soon_tasks"]] == ["Soon"]
    # just the titles, and the most urgent one
    assert (s["overdue_titles"], s["due_today_titles"], s["due_soon_titles"]) == (["Late"], ["Today"], ["Soon"])
    assert s["next_task_title"] == "Late" and s["next_task"]["title"] == "Late"

    # with an API token, as Home Assistant uses it
    token = post(client, alice, "/api/v1/auth/tokens/", name="Home Assistant")["token"]
    r = client.get("/api/v1/summary/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200 and r.json()["overdue"] == 1
    assert client.get("/api/v1/summary/").status_code == 401


def test_summary_per_workspace(client, alice, bob):
    work = post(client, alice, "/api/v1/workspaces/", name="Work")
    office = post(client, alice, "/api/v1/projects/", name="Office")
    home = post(client, alice, "/api/v1/projects/", name="Home")
    client.put(f"/api/v1/workspaces/projects/{office['id']}", json={"workspace_id": work["id"]}, headers=alice.headers)
    other = post(client, alice, "/api/v1/workspaces/", name="Private")
    client.put(f"/api/v1/workspaces/projects/{home['id']}", json={"workspace_id": other["id"]}, headers=alice.headers)
    post(client, alice, "/api/v1/tasks/", title="Office late", project_id=office["id"], deadline=day(-1))
    post(client, alice, "/api/v1/tasks/", title="Home late", project_id=home["id"], deadline=day(-1))
    s = client.get("/api/v1/summary/", params={"workspace": work["id"]}, headers=alice.headers).json()
    assert s["workspace"] == "Work" and [t["title"] for t in s["overdue_tasks"]] == ["Office late"]
    bobs = post(client, bob, "/api/v1/workspaces/", name="Bobs")
    assert client.get("/api/v1/summary/", params={"workspace": bobs["id"]}, headers=alice.headers).status_code == 404


# ---- MQTT ------------------------------------------------------------------------------

class FakeClient:
    """Stands in for paho: connects at once, records what's published."""
    instances = []

    def __init__(self, cfg):
        self.cfg, self.published = cfg, []
        self.on_connect = self.on_disconnect = None
        self.disconnected = False
        FakeClient.instances.append(self)

    def connect_async(self, host, port, keepalive=60):
        self.host, self.port = host, port

    def loop_start(self):
        self.on_connect(self, None, {}, 0, None)

    def loop_stop(self):
        pass

    def disconnect(self):
        self.disconnected = True

    def publish(self, topic, payload, qos=0, retain=False):
        self.published.append((topic, payload, retain))

    def last(self, topic):
        found = [p for t, p, _ in self.published if t == topic]
        if not found:
            return None
        try:
            return json.loads(found[-1])
        except ValueError:
            return found[-1]

    def all(self, topic):
        return [json.loads(p) for t, p, _ in self.published if t == topic and p]


@pytest.fixture
def bridge(monkeypatch):
    FakeClient.instances = []
    b = mqtt.Bridge(factory=FakeClient)
    b.debounce = 0
    monkeypatch.setattr(mqtt, "bridge", b)
    yield b


def test_mqtt_settings_are_for_admins_and_hide_the_password(client, admin, alice, bridge):
    assert client.get("/api/v1/home-assistant/mqtt", headers=alice.headers).status_code == 403
    assert client.put("/api/v1/home-assistant/mqtt", json={"enabled": True}, headers=admin.headers).status_code == 400  # no host
    r = client.put("/api/v1/home-assistant/mqtt", json={"host": "192.168.178.108", "reminder_time": "7:30"},
                   headers=admin.headers)
    assert r.status_code == 422  # HH:MM
    r = client.put("/api/v1/home-assistant/mqtt", json={"host": " 192.168.178.108 ", "username": "pm", "password": "s3cret"},
                   headers=admin.headers)
    assert r.status_code == 200
    s = r.json()["settings"]
    assert s["host"] == "192.168.178.108" and s["password_set"] is True and "password" not in s
    assert "s3cret" not in r.text
    # the password stays when it isn't sent again
    client.put("/api/v1/home-assistant/mqtt", json={"port": 1884}, headers=admin.headers)
    assert client.get("/api/v1/home-assistant/mqtt", headers=admin.headers).json()["settings"]["password_set"] is True
    assert client.put("/api/v1/home-assistant/mqtt", json={"topic": "a/#"}, headers=admin.headers).status_code == 422
    # nobody listening there: the test says so
    r = client.post("/api/v1/home-assistant/mqtt/test", json={"host": "127.0.0.1", "port": 1}, headers=admin.headers)
    assert r.json()["ok"] is False and r.json()["error"]


def test_mqtt_discovery_events_states_and_opt_out(client, admin, alice, bob, bridge):
    client.put("/api/v1/home-assistant/mqtt", json={"enabled": True, "host": "broker", "app_url": "http://pm.lan"},
               headers=admin.headers)
    bridge.drain()
    broker = FakeClient.instances[-1]
    assert (broker.host, broker.port) == ("broker", 1883)
    assert broker.last("project-manager/status") == "online"
    assert not [t for t, *_ in broker.published if t.startswith("homeassistant/")]  # nobody opted in yet

    # alice opts in: her device appears
    me = client.put("/api/v1/home-assistant/me", json={"enabled": True}, headers=alice.headers).json()
    assert me == {"available": True, "enabled": True, "workspace_id": None, "topic": "project-manager/alice"}
    bridge.drain()
    overdue = broker.last("homeassistant/sensor/project_manager_alice/overdue/config")
    assert overdue["state_topic"] == "project-manager/alice/state"
    assert overdue["device"]["name"] == "Project Manager (alice)"
    assert overdue["availability_topic"] == "project-manager/status"
    ev = broker.last("homeassistant/event/project_manager_alice/notification/config")
    assert "assigned" in ev["event_types"] and ev["state_topic"] == "project-manager/alice/event"
    assert broker.last("project-manager/alice/state")["overdue"] == 0
    nxt = broker.last("homeassistant/sensor/project_manager_alice/next_task/config")
    assert "state_class" not in nxt and "next_task_title" in nxt["value_template"]
    assert "'titles': value_json.overdue_titles" in overdue["json_attributes_template"]
    assert broker.last("project-manager/alice/state")["next_task_title"] == ""

    # bob assigns her something late: an event and a new state
    task = post(client, bob, "/api/v1/tasks/", title="Order cables", assignee_id=alice.id, deadline=day(-1))
    bridge.drain()
    events = broker.all("project-manager/alice/event")
    assert events[-1]["event_type"] == "assigned" and events[-1]["message"] == "bob assigned you: Order cables"
    assert events[-1]["url"] == f"http://pm.lan/?task={task['id']}"
    state = broker.last("project-manager/alice/state")
    assert state["overdue"] == 1 and state["unread_notifications"] == 1
    assert state["overdue_titles"] == ["Order cables"] and state["next_task_title"] == "Order cables"
    assert state["overdue_tasks"][0]["url"] == f"http://pm.lan/?task={task['id']}"
    # bob didn't opt in: nothing for him
    post(client, alice, "/api/v1/tasks/", title="For bob", assignee_id=bob.id)
    bridge.drain()
    assert not [t for t, *_ in broker.published if "/bob/" in t]

    # German for users who chose it; mentions come through too
    client.put("/api/v1/auth/me/preferences", json={"language": "de"}, headers=alice.headers)
    post(client, bob, f"/api/v1/tasks/{task['id']}/comments", body="@alice ready?")
    bridge.drain()
    assert broker.all("project-manager/alice/event")[-1]["message"] == "bob hat dich erwähnt: Order cables"

    # opting out removes her device
    client.put("/api/v1/home-assistant/me", json={"enabled": False}, headers=alice.headers)
    bridge.drain()
    assert broker.last("homeassistant/sensor/project_manager_alice/overdue/config") == ""
    assert broker.last("project-manager/alice/state") == ""


def test_mqtt_daily_reminder_and_workspace(client, admin, alice, bridge):
    work = post(client, alice, "/api/v1/workspaces/", name="Work")
    office = post(client, alice, "/api/v1/projects/", name="Office")
    client.put(f"/api/v1/workspaces/projects/{office['id']}", json={"workspace_id": work["id"]}, headers=alice.headers)
    client.put("/api/v1/workspaces/settings", json={"unassigned_everywhere": False}, headers=alice.headers)
    post(client, alice, "/api/v1/tasks/", title="Office late", project_id=office["id"], deadline=day(-1))
    post(client, alice, "/api/v1/tasks/", title="Private today", deadline=day(0))
    client.put("/api/v1/home-assistant/me", json={"enabled": True, "workspace_id": work["id"]}, headers=alice.headers)
    client.put("/api/v1/home-assistant/mqtt", json={"enabled": True, "host": "broker", "reminder_time": "00:00"},
               headers=admin.headers)
    bridge.drain()
    broker = FakeClient.instances[-1]
    reminders = [e for e in broker.all("project-manager/alice/event") if e["event_type"] == "deadlines"]
    assert len(reminders) == 1
    assert reminders[0]["message"] == "1 overdue: Office late"  # only the Work workspace
    assert broker.last("project-manager/alice/state")["workspace"] == "Work"
    bridge.drain()  # once a day
    assert len([e for e in broker.all("project-manager/alice/event") if e["event_type"] == "deadlines"]) == 1


def test_mqtt_switched_off_does_nothing(client, admin, alice, bridge):
    client.put("/api/v1/home-assistant/me", json={"enabled": True}, headers=alice.headers)
    bridge.drain()
    assert FakeClient.instances == [] and bridge.listening is False
    me = client.get("/api/v1/home-assistant/me", headers=alice.headers).json()
    assert me["available"] is False and me["enabled"] is True
    # switching off disconnects and says "offline"
    client.put("/api/v1/home-assistant/mqtt", json={"enabled": True, "host": "broker"}, headers=admin.headers)
    bridge.drain()
    broker = FakeClient.instances[-1]
    client.put("/api/v1/home-assistant/mqtt", json={"enabled": False}, headers=admin.headers)
    bridge.drain()
    assert broker.last("project-manager/status") == "offline" and broker.disconnected
    assert bridge.connected is False
