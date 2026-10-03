# Home Assistant

Your tasks and notifications in [Home Assistant](https://www.home-assistant.io/):
how many tasks are overdue or due today (with the tasks themselves), unread
notifications, and events to build automations on — a push to your phone when
someone assigns you a task, a morning announcement, a lamp that turns red.

There are two ways, and you can use both:

| | **Let Home Assistant fetch** (REST) | **Push over MQTT** |
|---|---|---|
| Setup | an API token and a few lines of YAML | an admin enters the broker once; each user ticks a box |
| Numbers and task lists | ✓ every minute | ✓ seconds after a change |
| Events for automations (assigned, mentioned, …) | — (only "the count went up") | ✓ as they happen |
| Daily deadline reminder | build it in HA from the numbers | ✓ at a time you choose |
| Sensors appear by themselves | — (YAML) | ✓ (MQTT Discovery) |
| Needs | HA reaching the app | the app reaching the broker |

Both live in the app under **Settings → Calendar & Home Assistant**, which shows the
YAML for your account, ready to copy.

![Settings → Calendar & Home Assistant](screenshots/home-assistant-settings.png)

- [Let Home Assistant fetch (REST)](#let-home-assistant-fetch-rest)
- [Push over MQTT](#push-over-mqtt)
- [Automation examples](#automation-examples)
- [What's in the data](#whats-in-the-data)
- [Troubleshooting](#troubleshooting)

## Let Home Assistant fetch (REST)

Home Assistant's [RESTful integration](https://www.home-assistant.io/integrations/rest/)
calls `GET /api/v1/summary/` with a personal API token and turns the answer into sensors.

1. **API token**: in the app, *Settings → Account → API tokens*, create one named e.g.
   *Home Assistant* (no expiry, or renew it in time). Copy it — it's shown once.
2. **secrets.yaml** in Home Assistant's config folder (File editor or Studio
   Code Server add-on):

   ```yaml
   project_manager_token: "Bearer pm_…your token…"
   ```

3. **configuration.yaml** — replace the address with your server's (the one
   in *Settings → Calendar & Home Assistant* is filled in already):

   ```yaml
   rest:
     - resource: http://192.168.100.113/api/v1/summary/
       headers:
         Authorization: !secret project_manager_token
       scan_interval: 60
       sensor:
         - name: "Tasks overdue"
           unique_id: project_manager_overdue
           value_template: "{{ value_json.overdue }}"
           json_attributes: [overdue_titles, overdue_tasks]
         - name: "Tasks due today"
           unique_id: project_manager_due_today
           value_template: "{{ value_json.due_today }}"
           json_attributes: [due_today_titles, due_today_tasks]
         - name: "Tasks due soon"
           unique_id: project_manager_due_soon
           value_template: "{{ value_json.due_soon }}"
           json_attributes: [due_soon_titles, due_soon_tasks]
         - name: "Next task"
           unique_id: project_manager_next_task
           value_template: "{{ value_json.next_task_title or '—' }}"
           json_attributes: [next_task]
         - name: "Task notifications"
           unique_id: project_manager_unread
           value_template: "{{ value_json.unread_notifications }}"
           json_attributes: [latest_notification]
   ```

4. *Developer tools → YAML → Check configuration*, then restart Home Assistant.
   The sensors `sensor.tasks_overdue`, `sensor.tasks_due_today`, … appear;
   their attributes hold just the titles (`overdue_titles`, …) and the tasks
   with project, deadline, priority and link (`overdue_tasks`, …).
   `sensor.next_task` shows the title of the most urgent task.

Options:

- **Only one [workspace](user-guide.md#workspaces)**: add `?workspace=<id>`
  to the address — *Settings → Calendar & Home Assistant* puts it in when you pick one.
- **HTTPS with the server's own CA**: add `verify_ssl: false` under the
  resource, or add the CA to Home Assistant.
- Each user who wants their own sensors makes their own token and block
  (with different names and `unique_id`s).

## Push over MQTT

The app connects to an MQTT broker — usually Home Assistant's **Mosquitto
broker** add-on — and, with [MQTT Discovery](https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery),
the sensors and an event entity show up in Home Assistant by themselves, as
the device **Project Manager (username)**. Needs Home Assistant 2025.10 or newer.

### In Home Assistant

1. *Settings → Add-ons → Add-on store → **Mosquitto broker*** → Install, Start.
2. *Settings → Devices & services*: Home Assistant offers the **MQTT**
   integration for it — Configure, Submit.
3. A login for the app: *Settings → People → Users → Add user* (e.g.
   `project-manager`, "Can only log in from the local network" is fine), or
   in the Mosquitto add-on's *Configuration → Logins*.

### In the app (admins)

*Settings → Calendar & Home Assistant → MQTT broker (admins)*:

| Field | |
|---|---|
| Send to Home Assistant over MQTT | on/off for the whole server |
| Broker address, Port | Home Assistant's address, `1883` (`8883` with TLS) |
| Username, Password | the login from step 3; the password isn't shown again (leave the field empty to keep it) |
| Topic | `project-manager` — where the app publishes (`project-manager/<user>/…`) |
| Discovery prefix | `homeassistant` (Home Assistant's default) |
| Daily deadline reminder at | e.g. `07:30` — the **server's** clock (the page shows its current time); empty: none |
| Address of this app | e.g. `http://192.168.100.113` — for links to tasks in events and sensors |
| TLS | if the broker has TLS set up |

**Test connection** tries the settings without saving; after **Save** the
status shows *● Connected*.

### Each user

*Settings → Calendar & Home Assistant → Push over MQTT*: tick **Send my notifications
and task numbers to Home Assistant**, optionally for one workspace. Untick it
and the device disappears from Home Assistant again.

### What appears in Home Assistant

Device **Project Manager (anna)** with:

| Entity | |
|---|---|
| `sensor.project_manager_anna_overdue` | overdue tasks; attributes `titles` (just the titles) and `tasks` (with project, deadline, priority, link) |
| `sensor.project_manager_anna_due_today` | due today; attributes `titles`, `tasks` |
| `sensor.project_manager_anna_due_soon` | due in the next 3 days; attributes `titles`, `tasks` |
| `sensor.project_manager_anna_next_task` | the **title** of the most urgent task — overdue first, then due today, then the next days (`—` when nothing is due); attribute `task` |
| `sensor.project_manager_anna_unread_notifications` | unread notifications; attribute `notification` (the latest) |
| `sensor.project_manager_anna_open_assigned` | open tasks assigned to anna |
| `event.project_manager_anna_notification` | fires with `event_type` **assigned**, **mention**, **comment**, **unblocked** (what it waited for is done) or **deadlines** (the daily reminder) |

The sensors update a few seconds after a change and every 5 minutes; they
show *unavailable* while the app is down.

## Automation examples

Push to your phone when someone assigns or mentions you (MQTT):

```yaml
automation:
  - alias: "Tasks: assigned or mentioned"
    triggers:
      - trigger: state
        entity_id: event.project_manager_anna_notification
    conditions:
      - condition: template
        value_template: "{{ trigger.to_state.attributes.event_type in ['assigned', 'mention'] }}"
    actions:
      - action: notify.mobile_app_annas_phone
        data:
          title: "Project Manager"
          message: "{{ trigger.to_state.attributes.message }}"
          data:
            url: "{{ trigger.to_state.attributes.url }}"   # opens the task (Companion app)
```

The morning reminder as a push (MQTT; sent at the reminder time when
something is overdue or due today):

```yaml
  - alias: "Tasks: morning reminder"
    triggers:
      - trigger: state
        entity_id: event.project_manager_anna_notification
    conditions:
      - "{{ trigger.to_state.attributes.event_type == 'deadlines' }}"
    actions:
      - action: notify.mobile_app_annas_phone
        data:
          message: "{{ trigger.to_state.attributes.message }}"
```

A lamp turns red while something is overdue (works with REST or MQTT — use
your sensor's name):

```yaml
  - alias: "Tasks: overdue lamp"
    triggers:
      - trigger: numeric_state
        entity_id: sensor.project_manager_anna_overdue
        above: 0
    actions:
      - action: light.turn_on
        target: { entity_id: light.desk }
        data: { color_name: red, brightness_pct: 40 }
```

Today's tasks on a dashboard — just the titles (Markdown card):

```yaml
type: markdown
title: Today
content: >
  {% for title in state_attr('sensor.project_manager_anna_overdue', 'titles') or [] %}
  - ⚠ **{{ title }}**
  {% endfor %}
  {% for title in state_attr('sensor.project_manager_anna_due_today', 'titles') or [] %}
  - {{ title }}
  {% endfor %}
```

The next task as a tile or in an announcement: the state of
`sensor.project_manager_anna_next_task` is its title, e.g.
`message: "Next up: {{ states('sensor.project_manager_anna_next_task') }}"`.

With more detail, use `tasks` instead of `titles`: `{{ t.title }} ({{ t.project }}, {{ t.deadline }})`.
(With the REST sensors, the attributes are `overdue_titles` / `overdue_tasks`
… on `sensor.tasks_overdue`, and `sensor.next_task`.)

## What's in the data

`GET /api/v1/summary/` and the MQTT state topic carry the same JSON:

```json
{
  "user": "anna",
  "workspace": null,
  "unread_notifications": 2,
  "overdue": 1,
  "due_today": 2,
  "due_soon": 3,
  "open_assigned": 7,
  "overdue_tasks": [
    {"id": 12, "title": "Order antenna modules", "project": "6GHub / Ordering",
     "deadline": "2026-10-02", "priority": 2, "overdue": true, "url": "http://192.168.100.113/?task=12"}
  ],
  "due_today_tasks": [],
  "due_soon_tasks": [],
  "overdue_titles": ["Order antenna modules"],
  "due_today_titles": [],
  "due_soon_titles": [],
  "next_task": {"id": 12, "title": "Order antenna modules", "…": "…"},
  "next_task_title": "Order antenna modules",
  "latest_notification": {"kind": "mention", "task_id": 12, "task_title": "Order antenna modules",
                          "actor": "bob", "excerpt": "@anna, go ahead", "created_at": "2026-10-03T07:12:00Z", "read": false},
  "updated_at": "2026-10-03T08:00:00Z"
}
```

- Overdue / due today / due soon count **open tasks assigned to you or to
  nobody** (like the bell), not in archived projects; *due soon* = the next 3
  days after today. Up to 20 tasks per list.
- "Today" is the **server's** date — set the server's time zone (see
  [DEPLOYMENT.md → Troubleshooting](../DEPLOYMENT.md#troubleshooting)).

MQTT topics (with the topic `project-manager` and a user `anna`):

| Topic | |
|---|---|
| `project-manager/status` | `online` / `offline` (retained; the broker sets `offline` if the app goes away) |
| `project-manager/anna/state` | the JSON above (retained) |
| `project-manager/anna/event` | `{"event_type": "assigned", "message": "bob assigned you: Order cables", "task_id": 12, "task_title": …, "project": …, "actor": "bob", "excerpt": …, "url": …}`; `deadlines`: `{"event_type": "deadlines", "message": "1 overdue, 2 due today: …", "overdue": 1, "due_today": 2, "tasks": [...]}` |
| `homeassistant/sensor/project_manager_anna/<key>/config`, `homeassistant/event/project_manager_anna/notification/config` | discovery (retained) |

Messages are in the user's language (English or German). Usernames become
`a-z`, `0-9` and `_` in topics.

**Privacy**: task titles — also from private projects the user can see — go
to the broker and Home Assistant. Limit it to one workspace if that matters.

## Troubleshooting

- **MQTT: "Not connected"** — can the app's server reach the broker? On the
  server: `timeout 3 bash -c '</dev/tcp/<broker>/1883' && echo open`. Between
  networks (e.g. over ZeroTier) the server needs a route to the broker's
  network; Home Assistant needs one back for REST.
- **"Not authorized"** — username/password of the MQTT login; Mosquitto
  needs a Home Assistant user or a login in the add-on.
- **Sensors don't appear** — is the MQTT integration set up in Home
  Assistant, and the discovery prefix `homeassistant`? *Settings → Devices &
  services → MQTT → Configure → Listen to a topic* `project-manager/#` shows
  what arrives.
- **REST: sensors unavailable** — Home Assistant's log names the reason; try
  the address with the token: `curl -H "Authorization: Bearer pm_…" http://<server>/api/v1/summary/`.
- **The reminder comes at the wrong time** — it goes by the server's clock;
  *Settings → Calendar & Home Assistant* shows the server's current time.
