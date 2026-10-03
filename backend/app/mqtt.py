"""Home Assistant over MQTT (optional; Settings -> Home Assistant).

When an admin switches it on, the server keeps one connection to the broker
(e.g. Home Assistant's Mosquitto add-on) and, for every user who opted in:

- announces sensors and an event entity via MQTT Discovery
  (<discovery>/sensor/project_manager_<user>/<key>/config, …/event/…), so they
  show up in Home Assistant as the device "Project Manager (<user>)";
- publishes the user's summary (app/summary.py) retained to
  <topic>/<user>/state -- shortly after changes and every 5 minutes;
- publishes notifications (assigned, mention, comment, unblocked) as they
  happen, and once a day at the reminder time what's overdue or due today
  ("deadlines"), to <topic>/<user>/event;
- keeps <topic>/status "online" (the broker sets "offline" when the server
  goes away), which Home Assistant uses for availability.

All of it runs in a background thread: requests never wait for the broker,
and while it's unreachable the app works as usual (sensors catch up later).
Users choose for themselves (users.mqtt_enabled), optionally for one
workspace (users.mqtt_workspace_id). Settings are stored as AppSetting rows
mqtt_*; the password isn't shown again once saved."""
import json
import logging
import queue
import re
import socket
import ssl
import threading
import time
from datetime import datetime
from itertools import chain
from typing import Optional

import paho.mqtt.client as paho
from sqlalchemy import event
from sqlalchemy.orm import Session

from app import access, summary
from app.database import SessionLocal
from app.models import AppSetting, Notification, Task, TaskComment, User
from app.version import APP_VERSION

log = logging.getLogger("project_manager.mqtt")

DEFAULTS = {
    "mqtt_enabled": False,
    "mqtt_host": "",
    "mqtt_port": 1883,
    "mqtt_username": "",
    "mqtt_password": "",
    "mqtt_tls": False,
    "mqtt_topic": "project-manager",
    "mqtt_discovery_prefix": "homeassistant",
    "mqtt_reminder_time": "07:30",  # server local time; "" = no daily reminder
    "mqtt_app_url": "",  # e.g. http://192.168.100.113, for links in events and sensors
}
CONNECTION_KEYS = ("mqtt_enabled", "mqtt_host", "mqtt_port", "mqtt_username", "mqtt_password", "mqtt_tls", "mqtt_topic")
REMINDER_SENT_KEY = "mqtt_reminder_sent"  # date of the last daily reminder
EVENT_TYPES = ["assigned", "mention", "comment", "unblocked", "deadlines"]
SENSORS = [
    # key, name, icon, what the attributes hold (summary keys)
    ("unread_notifications", "Unread notifications", "mdi:bell", {"notification": "latest_notification"}),
    ("overdue", "Overdue tasks", "mdi:alert-circle-outline", {"titles": "overdue_titles", "tasks": "overdue_tasks"}),
    ("due_today", "Due today", "mdi:calendar-today", {"titles": "due_today_titles", "tasks": "due_today_tasks"}),
    ("due_soon", "Due soon", "mdi:calendar-clock", {"titles": "due_soon_titles", "tasks": "due_soon_tasks"}),
    ("open_assigned", "Assigned to me", "mdi:clipboard-account-outline", None),
    ("next_task", "Next task", "mdi:clipboard-text-clock-outline", {"task": "next_task"}),
]
# Sensors whose state is text, not a count (no state_class).
TEXT_SENSORS = {"next_task": "{{ value_json.next_task_title if value_json.next_task_title else '—' }}"}

TEXTS = {
    "en": {
        "assigned": "{actor} assigned you: {title}",
        "mention": "{actor} mentioned you: {title}",
        "comment": "{actor} commented on {title}",
        "unblocked": "Ready to start: {title}",
        "overdue": "{n} overdue",
        "due_today": "{n} due today",
        "someone": "Someone",
        "deleted": "a deleted task",
    },
    "de": {
        "assigned": "{actor} hat dir zugewiesen: {title}",
        "mention": "{actor} hat dich erwähnt: {title}",
        "comment": "{actor} hat {title} kommentiert",
        "unblocked": "Kann losgehen: {title}",
        "overdue": "{n} überfällig",
        "due_today": "{n} heute fällig",
        "someone": "Jemand",
        "deleted": "eine gelöschte Aufgabe",
    },
}


# ---- settings ---------------------------------------------------------------

def _parse(default, raw: str):
    if isinstance(default, bool):
        return raw.strip().lower() in ("1", "true", "yes", "on")
    return type(default)(raw)


def read_config(db: Session) -> dict:
    values = dict(DEFAULTS)
    for row in db.query(AppSetting).filter(AppSetting.key.in_(DEFAULTS.keys())):
        values[row.key] = _parse(DEFAULTS[row.key], row.value)
    return values


def write_config(db: Session, changes: dict):
    for key, value in changes.items():
        row = db.get(AppSetting, key)
        if row is None:
            db.add(AppSetting(key=key, value=str(value)))
        else:
            row.value = str(value)
    db.commit()


def slug(username: str) -> str:
    """The user's part of topics and entity ids: lowercase letters, digits, _."""
    return re.sub(r"[^a-z0-9_]+", "_", username.lower()).strip("_") or "user"


def make_client(cfg: dict) -> paho.Client:
    client = paho.Client(paho.CallbackAPIVersion.VERSION2, client_id=f"project-manager-{socket.gethostname()}"[:64])
    if cfg["mqtt_username"]:
        client.username_pw_set(cfg["mqtt_username"], cfg["mqtt_password"] or None)
    if cfg["mqtt_tls"]:
        client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
    client.will_set(f"{cfg['mqtt_topic']}/status", "offline", qos=1, retain=True)
    client.reconnect_delay_set(1, 60)
    return client


def test_connection(cfg: dict, timeout: float = 6.0, factory=make_client) -> Optional[str]:
    """None if the broker takes these settings, else what went wrong."""
    if not cfg["mqtt_host"]:
        return "No broker address"
    result = {}
    done = threading.Event()
    client = factory({**cfg, "mqtt_topic": cfg["mqtt_topic"] or DEFAULTS["mqtt_topic"]})

    def on_connect(_client, _userdata, _flags, reason_code, _properties=None):
        result["rc"] = reason_code
        done.set()

    client.on_connect = on_connect
    try:
        client.connect(cfg["mqtt_host"], int(cfg["mqtt_port"]), keepalive=10)
    except Exception as exc:  # DNS, refused, TLS …
        return str(exc) or exc.__class__.__name__
    client.loop_start()
    try:
        if not done.wait(timeout):
            return "No answer from the broker"
        rc = result["rc"]
        if getattr(rc, "is_failure", False) or (isinstance(rc, int) and rc != 0):
            return str(rc)
        return None
    finally:
        client.disconnect()
        client.loop_stop()


# ---- the bridge -------------------------------------------------------------

class Bridge:
    def __init__(self, factory=make_client):
        self.factory = factory
        self.queue = queue.Queue()
        self.cfg = None
        self.client = None
        self.connected = False
        self.last_error = None
        self.listening = False  # MQTT on: pick up notifications and changes
        self.paused = False  # tests drive it with drain() instead
        self.debounce = 5.0  # seconds after a change before states go out
        self.state_every = 300.0
        self.announced = set()  # user slugs with discovery published
        self._dirty_since = None
        self._last_state = 0.0
        self._thread = None
        self._stop = threading.Event()

    # Called from requests and session hooks (any thread).
    def reload(self):
        self.queue.put(("reload", None))

    def notifications(self, ids):
        if self.listening:
            self.queue.put(("notifications", list(ids)))

    def changed(self):
        if self.listening:
            self.queue.put(("dirty", None))

    def status(self) -> dict:
        now = datetime.now()
        return {"connected": self.connected, "last_error": self.last_error, "users": len(self.announced),
                # the reminder time and "today" go by the server's clock
                "server_time": now.strftime("%H:%M"), "server_timezone": time.strftime("%Z")}

    def start(self):
        if self._thread is None:
            self.reload()
            self._thread = threading.Thread(target=self._run, name="mqtt", daemon=True)
            self._thread.start()

    def shutdown(self):
        self._stop.set()
        self._disconnect()

    def _run(self):
        while not self._stop.is_set():
            try:
                item = self.queue.get(timeout=5)
            except queue.Empty:
                item = None
            if self.paused:
                if item:
                    self.queue.put(item)
                time.sleep(0.2)
                continue
            try:
                self.step(item)
            except Exception:  # never let the thread die
                log.exception("MQTT bridge")

    def drain(self, now: Optional[float] = None):
        """Handle everything queued, then the periodic work (for tests)."""
        while True:
            try:
                item = self.queue.get_nowait()
            except queue.Empty:
                break
            self.step(item, now)
        self.step(None, now)

    def step(self, item, now: Optional[float] = None):
        now = time.time() if now is None else now
        kind, payload = item if item else (None, None)
        if kind not in ("reload", "connected") and self.cfg is not None and not self.cfg["mqtt_enabled"]:
            return  # switched off: nothing to do, not even a database query
        with SessionLocal() as db:
            if kind == "reload" or self.cfg is None:
                self._configure(db)
            if not self.cfg["mqtt_enabled"]:
                return
            if kind == "connected":
                self._announce(db, force=True)
                self._dirty_since = self._dirty_since or now - self.debounce
            if kind == "notifications":
                self._publish_notifications(db, payload)
            if kind in ("dirty", "notifications") and self._dirty_since is None:
                self._dirty_since = now
            if not self.connected:
                return
            due = self._dirty_since is not None and now - self._dirty_since >= self.debounce
            if due or now - self._last_state >= self.state_every:
                self._publish_states(db)
                self._last_state = now
                self._dirty_since = None
            self._remind(db)

    # ---- connection
    def _configure(self, db: Session):
        new = read_config(db)
        old = self.cfg
        self.cfg = new
        self.listening = new["mqtt_enabled"]
        if old is None or any(old[k] != new[k] for k in CONNECTION_KEYS):
            self._disconnect(old)
            if new["mqtt_enabled"] and new["mqtt_host"]:
                self._connect(new)
        elif new["mqtt_enabled"] and self.connected:
            self._announce(db)  # who opted in may have changed
            self._dirty_since = time.time() - self.debounce

    def _connect(self, cfg: dict):
        client = self.factory(cfg)
        client.on_connect = self._on_connect
        client.on_disconnect = self._on_disconnect
        self.client = client
        self.last_error = None
        try:
            client.connect_async(cfg["mqtt_host"], int(cfg["mqtt_port"]), keepalive=60)
            client.loop_start()
        except Exception as exc:
            self.last_error = str(exc)
            log.warning("MQTT: can't connect to %s: %s", cfg["mqtt_host"], exc)

    def _disconnect(self, cfg: Optional[dict] = None):
        client, self.client = self.client, None
        if client is None:
            return
        if self.connected and cfg:
            try:
                client.publish(f"{cfg['mqtt_topic']}/status", "offline", qos=1, retain=True)
            except Exception:
                pass
        self.connected = False
        self.announced = set()
        try:
            client.disconnect()
            client.loop_stop()
        except Exception:
            pass

    def _on_connect(self, client, _userdata, _flags, reason_code, _properties=None):
        if client is not self.client:
            return
        failed = getattr(reason_code, "is_failure", False) or (isinstance(reason_code, int) and reason_code != 0)
        if failed:
            self.connected = False
            self.last_error = str(reason_code)
            log.warning("MQTT: broker refused the connection: %s", reason_code)
            return
        self.connected = True
        self.last_error = None
        client.publish(f"{self.cfg['mqtt_topic']}/status", "online", qos=1, retain=True)
        self.queue.put(("connected", None))

    def _on_disconnect(self, client, _userdata, _flags, reason_code, _properties=None):
        if client is not self.client:
            return
        self.connected = False
        if reason_code is not None and str(reason_code) not in ("0", "Success", "Normal disconnection"):
            self.last_error = str(reason_code)

    def _publish(self, topic: str, payload, retain: bool = False):
        if self.client is None or not self.connected:
            return
        data = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
        self.client.publish(topic, data, qos=1, retain=retain)

    # ---- what goes out
    def _users(self, db: Session):
        return db.query(User).filter(User.mqtt_enabled.is_(True), User.is_active.is_(True)).order_by(User.id).all()

    def _workspace(self, db: Session, user: User):
        try:
            return summary.user_workspace(db, user, user.mqtt_workspace_id)
        except ValueError:
            return None

    def _discovery(self, user: User) -> dict:
        """topic -> config for the user's entities."""
        cfg, s = self.cfg, slug(user.username)
        base, disc = cfg["mqtt_topic"], cfg["mqtt_discovery_prefix"]
        device = {"identifiers": [f"project_manager_{s}"], "name": f"Project Manager ({user.username})",
                  "manufacturer": "Project Manager", "model": "Tasks", "sw_version": APP_VERSION}
        if cfg["mqtt_app_url"]:
            device["configuration_url"] = cfg["mqtt_app_url"]
        common = {"device": device, "availability_topic": f"{base}/status"}
        state = f"{base}/{s}/state"
        out = {}
        for key, name, icon, attrs in SENSORS:
            entity = {"name": name, "unique_id": f"pm_{s}_{key}", "default_entity_id": f"sensor.project_manager_{s}_{key}", "state_topic": state,
                      "value_template": TEXT_SENSORS.get(key, "{{ value_json.%s }}" % key), "icon": icon, **common}
            if key not in TEXT_SENSORS:
                entity["state_class"] = "measurement"
            if attrs:
                pairs = ", ".join(f"'{name_}': value_json.{field}" for name_, field in attrs.items())
                entity["json_attributes_topic"] = state
                entity["json_attributes_template"] = "{{ {%s, 'workspace': value_json.workspace} | tojson }}" % pairs
            out[f"{disc}/sensor/project_manager_{s}/{key}/config"] = entity
        out[f"{disc}/event/project_manager_{s}/notification/config"] = {
            "name": "Notification", "unique_id": f"pm_{s}_notification", "default_entity_id": f"event.project_manager_{s}_notification",
            "state_topic": f"{base}/{s}/event",
            "event_types": EVENT_TYPES, "icon": "mdi:bell-ring", **common,
        }
        return out

    def _announce(self, db: Session, force: bool = False):
        if not self.connected:
            return
        users = {slug(u.username): u for u in self._users(db)}
        for s in self.announced - set(users):
            # Opted out: remove their entities and retained state.
            for key, *_ in SENSORS:
                self._publish(f"{self.cfg['mqtt_discovery_prefix']}/sensor/project_manager_{s}/{key}/config", "", retain=True)
            self._publish(f"{self.cfg['mqtt_discovery_prefix']}/event/project_manager_{s}/notification/config", "", retain=True)
            self._publish(f"{self.cfg['mqtt_topic']}/{s}/state", "", retain=True)
        for s, user in users.items():
            if force or s not in self.announced:
                for topic, entity in self._discovery(user).items():
                    self._publish(topic, entity, retain=True)
        self.announced = set(users)

    def _publish_states(self, db: Session):
        for user in self._users(db):
            data = summary.build(db, user, self._workspace(db, user), base_url=self.cfg["mqtt_app_url"].rstrip("/"))
            self._publish(f"{self.cfg['mqtt_topic']}/{slug(user.username)}/state", data, retain=True)

    def _publish_notifications(self, db: Session, ids):
        for n in db.query(Notification).filter(Notification.id.in_(ids)).order_by(Notification.id):
            user = db.get(User, n.user_id)
            if user is None or not user.mqtt_enabled or not user.is_active:
                continue
            task = n.task
            if task is not None and not access.task_visible(db, user, task):
                continue
            scope = summary.Scope(db, user, self._workspace(db, user))
            if task is not None and not scope.counts(task):
                continue
            words = TEXTS.get(user.language or "en", TEXTS["en"])
            title = task.title if task else words["deleted"]
            actor = n.actor.username if n.actor else words["someone"]
            payload = {
                "event_type": n.kind,
                "message": words.get(n.kind, "{title}").format(actor=actor, title=title),
                "task_id": n.task_id,
                "task_title": task.title if task else None,
                "project": scope.project_label(task) if task else "",
                "actor": n.actor.username if n.actor else None,
                "excerpt": n.excerpt,
            }
            if self.cfg["mqtt_app_url"] and n.task_id:
                payload["url"] = f"{self.cfg['mqtt_app_url'].rstrip('/')}/?task={n.task_id}"
            self._publish(f"{self.cfg['mqtt_topic']}/{slug(user.username)}/event", payload)

    def _remind(self, db: Session):
        at = self.cfg["mqtt_reminder_time"]
        if not at:
            return
        now = datetime.now()
        today = now.date().isoformat()
        if now.strftime("%H:%M") < at:
            return
        sent = db.get(AppSetting, REMINDER_SENT_KEY)
        if sent is not None and sent.value == today:
            return
        for user in self._users(db):
            data = summary.build(db, user, self._workspace(db, user), base_url=self.cfg["mqtt_app_url"].rstrip("/"))
            if not data["overdue"] and not data["due_today"]:
                continue
            words = TEXTS.get(user.language or "en", TEXTS["en"])
            parts = [words[k].format(n=data[k]) for k in ("overdue", "due_today") if data[k]]
            titles = [t["title"] for t in data["overdue_tasks"] + data["due_today_tasks"]]
            message = ", ".join(parts) + ": " + ", ".join(titles[:5]) + (" …" if len(titles) > 5 else "")
            self._publish(f"{self.cfg['mqtt_topic']}/{slug(user.username)}/event", {
                "event_type": "deadlines", "message": message, "overdue": data["overdue"],
                "due_today": data["due_today"], "tasks": data["overdue_tasks"] + data["due_today_tasks"],
            })
        write_config(db, {REMINDER_SENT_KEY: today})


bridge = Bridge()


# ---- picking up changes ---------------------------------------------------------
# New notifications are collected when they're flushed and handed over once
# the transaction is committed (never for rolled-back work).

WATCHED = (Task, Notification, TaskComment)


@event.listens_for(Session, "after_flush")
def _after_flush(session, _context):
    if not bridge.listening:
        return
    ids = [o.id for o in session.new if isinstance(o, Notification)]
    if ids:
        session.info.setdefault("pm_mqtt_notifications", []).extend(ids)
    if any(isinstance(o, WATCHED) for o in chain(session.new, session.dirty, session.deleted)):
        session.info["pm_mqtt_dirty"] = True


@event.listens_for(Session, "after_commit")
def _after_commit(session):
    ids = session.info.pop("pm_mqtt_notifications", None)
    dirty = session.info.pop("pm_mqtt_dirty", False)
    if ids:
        bridge.notifications(ids)
    elif dirty:
        bridge.changed()


@event.listens_for(Session, "after_rollback")
def _after_rollback(session):
    session.info.pop("pm_mqtt_notifications", None)
    session.info.pop("pm_mqtt_dirty", None)
