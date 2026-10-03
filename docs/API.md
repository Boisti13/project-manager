# Project Manager API

The web app is a client of a REST API; scripts and other apps (a future
desktop client, automations) can use the same API.

- **Base URL**: `https://<server>/api/v1` — stable: fields may be added, but
  nothing is removed or changed in meaning within v1. The unversioned
  `/api/...` paths are the same endpoints for the bundled web app and may
  change with it; don't use them from other clients.
- **Interactive docs**: `https://<server>/api/docs` (Swagger UI) and
  `/api/redoc`; the machine-readable spec is `/api/openapi.json` (for client
  generators). The docs page loads its scripts from a CDN, so the browser
  needs internet access to show it.
- **JSON** in and out; timestamps are UTC without a timezone suffix
  (`2026-09-27T10:15:00`), deadlines are dates at midnight.
- **Priority** is a number: `0` Low (default), `1` Medium, `2` High,
  `3` Critical.
- **Estimate** (`estimate_minutes`) is a number of minutes, or `null` for
  none (1 to 525600).

## HTTPS

The server uses a certificate from its own local CA (see
[DEPLOYMENT.md → HTTPS](../DEPLOYMENT.md#https)). Clients either trust that CA
system-wide (import it once, then everything just works) or point at it
explicitly: download it from `http://<server>/ca.crt` and pass it, e.g.
`curl --cacert ca.crt …` or `requests.get(…, verify="ca.crt")`.

On Windows, the built-in `curl.exe` (Schannel) additionally insists on a
revocation check, which a private CA can't answer — add `--ssl-no-revoke`.
Browsers and .NET's `HttpClient` don't need this.

## Authentication

Every request sends `Authorization: Bearer <token>`. Two kinds of token:

1. **Personal API token** (`pm_…`) — for scripts and apps. Create one under
   **Settings → API tokens** in the web app; it's shown once, copy it then.
   Optionally it expires after 30/90/365 days. Revoke it there at any time.
   Only a hash is stored on the server.
2. **Login token** — `POST /api/v1/auth/login` with the form fields
   `username` and `password` returns `{"access_token": "…"}`, valid for 7
   days. Handy for a desktop app that asks for the password once. For an
   account with **two-factor login**, also send `otp` (the 6-digit code from
   the authenticator app, or a recovery code); without it the answer is
   `401` with `"detail": "Two-factor code required"`. After 5 failed logins
   for an account from one address within 15 minutes (or 20 for any
   accounts), logins from there get `429` with `Retry-After` until the 15
   minutes are over. API tokens aren't affected by either.

A token acts as its user: it sees and changes exactly what that user can
(private projects included or not, admin endpoints only for admins).
Deactivating the user stops their tokens immediately. Managing tokens and
changing the password need a password login, not an API token (403).

Errors: `401` = missing/invalid/expired token, `403` = not allowed, `404` =
doesn't exist *or you can't see it* (private projects), `400`/`422` =
invalid input (`{"detail": …}`).

## Examples

```bash
TOKEN=pm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
API=https://192.168.100.113/api/v1
curl -so ca.crt http://192.168.100.113/ca.crt     # once; or trust the CA system-wide
alias curl='curl --cacert ca.crt'                 # Windows curl.exe: also --ssl-no-revoke

# who am I
curl -s -H "Authorization: Bearer $TOKEN" $API/auth/me

# all tasks I can see (subtasks included; parent_task_id links them)
curl -s -H "Authorization: Bearer $TOKEN" $API/tasks/

# create a task in project 3, due on 1 October, with label 2
curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"title": "Order cables", "project_id": 3, "deadline": "2026-10-01T00:00:00", "label_ids": [2]}' \
     $API/tasks/

# tick it off (repeating tasks create their next occurrence, as in the app)
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"status": "done"}' $API/tasks/42

# several tasks at once, as a tree
curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"project_id": 3, "items": [{"title": "Parts", "children": [{"title": "Antenna"}]}]}' \
     $API/tasks/bulk
```

Python:

```python
import requests

api = requests.Session()
api.headers["Authorization"] = "Bearer pm_…"
api.verify = "ca.crt"  # the server's CA certificate (http://<server>/ca.crt)
base = "https://192.168.100.113/api/v1"

open_tasks = [t for t in api.get(f"{base}/tasks/").json() if t["status"] != "done"]
api.post(f"{base}/tasks/{open_tasks[0]['id']}/comments", json={"body": "Done via script"})
```

## Main resources

| Path | What |
|---|---|
| `/auth/login`, `/auth/me`, `/auth/me/preferences` | log in, current user, language |
| `/auth/tokens/` | personal API tokens (password login only) |
| `/auth/2fa`, `/auth/2fa/setup`, `/auth/2fa/enable`, `/auth/2fa/recovery-codes`, `/auth/2fa/disable` | two-factor login (password login only): status (`enabled`, `recovery_left`); `setup` gives a new `secret`, its `uri` (otpauth://) and `qr_svg`; `enable` (`code`) switches it on and answers 10 `recovery_codes` (shown once); `recovery-codes` and `disable` take the `password` |
| `/tasks/`, `/tasks/{id}`, `/tasks/bulk`, `/tasks/{id}/activity` | tasks (fields incl. `label_ids`, `blocked_by_ids`, `estimate_minutes`, `start_date` (not after the `deadline`), repeat rule: `recurrence_unit`, `recurrence_interval`, `recurrence_weekdays` (0 = Monday), `recurrence_monthly`, `recurrence_from`) and their history |
| `/tasks/bulk` (details) | `{"items": [...], …shared fields}`: a tree of `{title, status?, children}`; each item may also carry its own `priority`, `deadline`, `start_date`, `assignee_id`, `label_ids` (added to the shared ones) and `recurrence_unit` / `recurrence_interval` / `recurrence_weekdays`, which win over the shared fields; everyone who gets tasks is notified once |
| `/tasks/bulk-update` | change several tasks in one request, all or nothing: `{"updates": [{"id": 1, "status": "done"}, {"id": 2, "priority": 3, "expected": {...}}]}` — each item takes the fields of `PUT /tasks/{id}` (incl. `expected`); someone who gets several tasks assigned is notified once |
| `/tasks/{id}/comments`, `/comments/{id}`, `/comments/search` | comments; `@username` in a comment notifies that user (`kind: "mention"`) |
| `/workspaces/`, `/workspaces/{id}`, `/workspaces/order`, `/workspaces/settings`, `/workspaces/projects/{project_id}` | the current user's own workspaces (groups of projects): `GET` lists them in order, each with `project_ids` (top-level, visible), plus `unassigned_everywhere`; `POST` (`name`, optional `color`), `PUT` (`name`, `color`), `DELETE` (its projects stay); `PUT /order` (`ids`: all of them, in the new order); `PUT /settings` (`unassigned_everywhere`: show projects in no workspace everywhere or only under "All"); `PUT /projects/{id}` (`workspace_id`, or `null` for none) files a top-level project — for this user only |
| `/pins/`, `/pins/{task_id}` | the current user's pinned tasks: `GET` (task ids), `PUT` to pin, `DELETE` to unpin |
| `/projects/`, `/projects/{id}` | projects and categories (`parent_id`), `is_private`, `member_ids`; `archived_at` (set with `PUT {"archived": true/false}`, top-level projects only) |
| `/projects/{id}/share` | `POST`: a read-only link for the project (`share_token`; the same one if it exists), `DELETE`: stop sharing |
| `/share/{token}` | **no login**: the shared project, its categories and tasks (no comments, history or people) |
| `/labels/` | labels |
| `/templates/`, `/templates/{id}`, `/templates/{id}/use` | task templates (shared): save a task with its subtasks (`name`, `task_id`), list them (with the `tree`), delete (who saved it, or an admin), and create the tasks (`title`, `project_id`, `parent_task_id`, `deadline`, `assignee_id`; returns their `ids`, the top one first) |
| `/saved-filters/`, `/saved-filters/{id}` | the current user's saved task-list filters: `name` and `query` (the Tasks page URL query, e.g. `assignee=me&sort=deadline`); saving under an existing name replaces it |
| `/notifications/`, `/notifications/read` | the current user's notifications |
| `/summary/?workspace={id}` | the current user's numbers in one call — unread notifications, overdue / due today / due soon (with up to 20 tasks each), open tasks assigned to them, the latest notification; made for Home Assistant ([home-assistant.md](home-assistant.md#whats-in-the-data)) |
| `/home-assistant/me`, `/home-assistant/mqtt`, `/home-assistant/mqtt/test` | MQTT for Home Assistant: the user's opt-in (`enabled`, `workspace_id`); for admins the broker settings (the password is write-only; `status` tells whether it's connected and the server's time) and a connection test |
| `/users/` | users (admins: `/users/admin/all` incl. `two_factor`, create, change, `DELETE /users/{id}/two-factor` switches someone's two-factor login off) |
| `/transfer/export`, `/transfer/import` | project export/import (JSON) |
| `/calendar/feed`, `/calendar/feed/reset`, `/calendar/{token}.ics?scope=mine\|all&workspace={id}` | the user's calendar feed link, and the feed itself (no login: the token in the link is the key); `workspace` (optional): only that workspace of the user's |
| `/sync/?since=…` | everything visible, or what changed since a cursor — for offline clients |
| `/deletions/?since=…` | what was deleted (tasks, comments, projects, labels), for clients that keep a copy |
| `/settings/`, `/system/…` | instance settings, version/updates, backups (admins) |

The full list with every field is in `/api/docs`.

## Keeping a copy (offline clients, sync scripts)

The groundwork for clients that keep their own copy of the data and sync
it later:

- **`uid`** — tasks, projects, labels and comments have a UUID besides the
  numeric `id`. A client that creates something offline picks the uid
  itself and sends it (`"uid": "…"`) when it syncs; **sending the same
  create again returns the existing object** instead of making a second
  one, so retries after a lost response are safe. Subtasks created offline
  can point at their parent with `parent_task_uid`, tasks at a project with
  `project_uid`.
- **`updated_at`** — changes whenever an object's representation changes,
  for tasks also when their labels or dependencies change, or when a label
  or project they belong to is deleted. Poll lists and keep what's newer
  than your copy.
- **Deletions** — `GET /api/v1/deletions/?since=2026-09-27T10:00:00`
  lists what was deleted after that time (`entity`, `id`, `uid`,
  `deleted_at`), including subtasks and comments that went with a task, and
  categories that went with a project. Remember the newest `deleted_at` you
  saw and ask for everything after it next time.

### Syncing: `GET /api/v1/sync/`

- **Without parameters**: a full snapshot of everything the user can see —
  `tasks` (flat; `parent_task_id` links subtasks), `projects` (with
  categories), `labels`, `comments`, `users` (id, name, active) — and a
  **`cursor`**.
- **With `?since=<cursor>`**: only what changed after that cursor (plus
  `deletions`), and a new `cursor`. Store it and pass it next time. The
  server looks a few seconds further back than the cursor so nothing
  committed during a sync is missed; you may get an object twice — just
  overwrite your copy by `id`/`uid`.
- **`ids`** (always present): the ids of all tasks, projects and labels the
  user can see *right now*. Drop local copies of anything not listed —
  that covers deletions and losing access to a private project. Getting
  access to a private project sends its project and tasks as changed.
- Comments come along when they're new or edited, and all comments of every
  task in the response.

A client loop:

1. First start: `GET /sync/` → store everything and the cursor.
2. Offline edits: queue them locally (creates with a client-chosen `uid`).
3. Back online: send the queue in order (creates, then updates, then
   deletes; retries are safe thanks to the `uid`), then
   `GET /sync/?since=<cursor>` → apply changes, drop what's not in `ids`,
   store the new cursor.

### Conflicts: last write wins per field, or `expected`

`PUT /tasks/{id}` only changes the fields you send, so two people editing
*different* fields of a task never overwrite each other. For the *same*
field the later write wins — unless the client sends **`expected`**: the
values its edit was based on, e.g.

```json
{"priority": 3, "expected": {"priority": 1}}
```

If any of those fields has a different value on the server by now, nothing
is saved and the answer is **409**:

```json
{"detail": {"message": "Changed on the server since; nothing was saved",
            "conflicts": {"priority": {"expected": 1, "current": 2}},
            "task": { … the current task … }}}
```

The client can then show both versions, or resend without `expected` to
overwrite on purpose. Deadlines are compared as dates, label and dependency
lists regardless of order. The task history records every change either way.
