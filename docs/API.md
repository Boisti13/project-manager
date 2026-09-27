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
   days. Handy for a desktop app that asks for the password once.

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
| `/tasks/`, `/tasks/{id}`, `/tasks/bulk`, `/tasks/{id}/activity` | tasks (fields incl. `label_ids`, `blocked_by_ids`, repeat rule: `recurrence_unit`, `recurrence_interval`, `recurrence_weekdays` (0 = Monday), `recurrence_monthly`, `recurrence_from`) and their history |
| `/tasks/{id}/comments`, `/comments/{id}`, `/comments/search` | comments |
| `/projects/`, `/projects/{id}` | projects and categories (`parent_id`), `is_private`, `member_ids` |
| `/labels/` | labels |
| `/notifications/`, `/notifications/read` | the current user's notifications |
| `/users/` | users (admins: `/users/admin/all`, create, change) |
| `/transfer/export`, `/transfer/import` | project export/import (JSON) |
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
