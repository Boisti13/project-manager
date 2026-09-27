# Project Manager API

The web app is a client of a REST API; scripts and other apps (a future
desktop client, automations) can use the same API.

- **Base URL**: `http://<server>/api/v1` — stable: fields may be added, but
  nothing is removed or changed in meaning within v1. The unversioned
  `/api/...` paths are the same endpoints for the bundled web app and may
  change with it; don't use them from other clients.
- **Interactive docs**: `http://<server>/api/docs` (Swagger UI) and
  `/api/redoc`; the machine-readable spec is `/api/openapi.json` (for client
  generators). The docs page loads its scripts from a CDN, so the browser
  needs internet access to show it.
- **JSON** in and out; timestamps are UTC without a timezone suffix
  (`2026-09-27T10:15:00`), deadlines are dates at midnight.

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
API=http://192.168.100.113/api/v1

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
base = "http://192.168.100.113/api/v1"

open_tasks = [t for t in api.get(f"{base}/tasks/").json() if t["status"] != "done"]
api.post(f"{base}/tasks/{open_tasks[0]['id']}/comments", json={"body": "Done via script"})
```

## Main resources

| Path | What |
|---|---|
| `/auth/login`, `/auth/me`, `/auth/me/preferences` | log in, current user, language |
| `/auth/tokens/` | personal API tokens (password login only) |
| `/tasks/`, `/tasks/{id}`, `/tasks/bulk`, `/tasks/{id}/activity` | tasks (fields incl. `label_ids`, `blocked_by_ids`, `recurrence_unit`) and their history |
| `/tasks/{id}/comments`, `/comments/{id}`, `/comments/search` | comments |
| `/projects/`, `/projects/{id}` | projects and categories (`parent_id`), `is_private`, `member_ids` |
| `/labels/` | labels |
| `/notifications/`, `/notifications/read` | the current user's notifications |
| `/users/` | users (admins: `/users/admin/all`, create, change) |
| `/transfer/export`, `/transfer/import` | project export/import (JSON) |
| `/settings/`, `/system/…` | instance settings, version/updates, backups (admins) |

The full list with every field is in `/api/docs`.
