"""Local preview with sample data: a throwaway PostgreSQL, the backend and a
production build of the frontend on one port. For screenshots
(tools/screenshots.py) and trying the interface; nothing touches a real
server. See docs/development.md -> Preview and screenshots.

    python tools/preview_server.py                 # http://localhost:8765
    PM_PREVIEW_BUILD=path/to/build python tools/preview_server.py

The build defaults to frontend/build (made with `npm run build`). The
database and sample backups live in tools/.preview/ (git-ignored); the
sample users' tokens are written there for the screenshot script. Delete
tools/.preview/pgdata if PostgreSQL won't start (e.g. after a crash).
"""
import datetime as _dt
import json as _json
import os
import subprocess
import sys
import time as _time

import pgserver

TOOLS = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(TOOLS)
BACKEND = os.path.join(REPO, "backend")
DATA = os.path.join(TOOLS, ".preview")
BUILD = os.environ.get("PM_PREVIEW_BUILD") or os.path.join(REPO, "frontend", "build")
PORT = int(os.environ.get("PM_PREVIEW_PORT", "8765"))
os.makedirs(DATA, exist_ok=True)
if not os.path.isfile(os.path.join(BUILD, "index.html")):
    sys.exit(f"No frontend build at {BUILD} -- run `npm run build` in frontend/ or set PM_PREVIEW_BUILD.")

# psycopg's binary build can be blocked (e.g. by Windows application
# control); its pure-Python mode with pgserver's libpq always works.
os.environ["PATH"] = os.path.join(os.path.dirname(pgserver.__file__), "pginstall", "bin") + os.pathsep + os.environ["PATH"]
os.environ.setdefault("PSYCOPG_IMPL", "python")

srv = pgserver.get_server(os.path.join(DATA, "pgdata"), cleanup_mode=None)
port = srv.get_uri().rsplit(":", 1)[1].split("/")[0]
srv.psql("DROP DATABASE IF EXISTS pmui;")
srv.psql("CREATE DATABASE pmui;")
os.environ.update(DB_HOST="127.0.0.1", DB_PORT=port, DB_USER="postgres", DB_PASSWORD="", DB_NAME="pmui",
                  SECRET_KEY="local-preview-only-not-a-real-secret-key", PM_MQTT_THREAD="0")

# Sample backups for the Settings screenshot.
BK = os.path.join(DATA, "backups")
os.makedirs(BK, exist_ok=True)
for i, (name, age_h) in enumerate([("before-update-from-a8c6ea7", 50), ("manual-preview", 26), ("before-update-from-38f9163", 2)]):
    f = os.path.join(BK, f"projectmanager-2026092{2 + i}-10{i}500-{name}.dump")
    with open(f, "wb") as out:
        out.write(b"PGDMP" + os.urandom(14000 + 900 * i))
    t = _time.time() - age_h * 3600
    os.utime(f, (t, t))
os.environ["PM_BACKUP_DIR"] = BK

os.chdir(BACKEND)
sys.path.insert(0, BACKEND)
subprocess.run([sys.executable, "migrate.py"], check=True, capture_output=True)

from fastapi import Request, Response  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

from app.main import app  # noqa: E402


@app.middleware("http")
async def _server_path(request: Request, call_next):
    """Screenshots show the server's real backup folder, not tools/.preview."""
    resp = await call_next(request)
    if request.url.path == "/api/system/backups" and request.method == "GET":
        body = b"".join([c async for c in resp.body_iterator])
        body = body.replace(_json.dumps(BK)[1:-1].encode(), b"/var/backups/project-manager")
        return Response(body, status_code=resp.status_code, media_type="application/json")
    return resp


# ---- sample data, created through the real API -------------------------------
# Dates are relative to today, so the screenshots look the same whenever
# they're taken: a few things overdue, one due today, some coming up.
def day(offset):
    return _dt.datetime.combine(_dt.date.today() + _dt.timedelta(days=offset), _dt.time()).isoformat()


c = TestClient(app)
c.post("/api/auth/register", json={"username": "preview", "email": "preview@example.com", "password": "preview-pass-1"})
tok = c.post("/api/auth/login", data={"username": "preview", "password": "preview-pass-1"}).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
me = c.get("/api/auth/me", headers=H).json()["id"]
c.post("/api/users/", json={"username": "anna", "email": "anna@example.com", "password": "anna-pass-1"}, headers=H)
tok_anna = c.post("/api/auth/login", data={"username": "anna", "password": "anna-pass-1"}).json()["access_token"]
Hanna = {"Authorization": f"Bearer {tok_anna}"}
anna = c.get("/api/auth/me", headers=Hanna).json()["id"]

P = lambda name, **kw: c.post("/api/projects/", json={"name": name, **kw}, headers=H).json()["id"]  # noqa: E731
T = lambda title, headers=H, **kw: c.post("/api/tasks/", json={"title": title, **kw}, headers=headers).json()["id"]  # noqa: E731
L = lambda name, color: c.post("/api/labels/", json={"name": name, "color": color}, headers=H).json()["id"]  # noqa: E731

urgent, hw, waiting = L("urgent", "#f44336"), L("hardware", "#795548"), L("waiting for supplier", "#ff9800")
hub = P("6GHub", color="#2196f3", description="Demonstrator for the 6G research hub")
docs, gen, order = (P(n, parent_id=hub) for n in ("Documentation", "General", "Ordering"))
flat = P("Apartment", color="#4caf50", is_private=True, member_ids=[me])
fair = P("Trade fair 2025", color="#ff9800")

kickoff = T("Kick-off meeting notes", project_id=hub, assignee_id=me, priority=2, estimate_minutes=60, status="in_progress",
            start_date=day(-13), deadline=day(-4), label_ids=[urgent])
t1 = T("Order antenna modules", project_id=order, priority=2, start_date=day(-20), deadline=day(-14), label_ids=[hw, waiting],
       description="Supplier needs the **final quantities** — see the [quote](https://example.com/quote-4711).\n"
                   "- 40 antenna modules\n- delivery to `Geb. 24`")
T("Check supplier quote", project_id=order, parent_task_id=t1, status="done", estimate_minutes=30)
T("Confirm delivery date", project_id=order, parent_task_id=t1, estimate_minutes=30)
T("Call supplier about delivery", project_id=order, assignee_id=me, priority=2, deadline=day(0), label_ids=[waiting])
T("Order power supplies", project_id=order, status="done", priority=1)
T("Order cables", project_id=order, status="done", assignee_id=anna)
old = T("Old finished thing", project_id=order, status="done")
demo = T("Prepare demo setup", project_id=docs, assignee_id=me, priority=1, estimate_minutes=90, start_date=day(-6),
         deadline=day(-2), label_ids=[hw])
T("Set up the laptop", project_id=docs, parent_task_id=demo, status="done")
T("Charge the batteries", project_id=docs, parent_task_id=demo, status="done")
guide = T("Write setup guide", project_id=docs, estimate_minutes=240, start_date=day(1), deadline=day(5),
          description="Step by step, with photos of the demo setup.")
weekly = T("Weekly sync", project_id=gen, priority=1, deadline=day(-6), recurrence_unit="week", recurrence_interval=1,
           recurrence_weekdays=[(_dt.date.today() - _dt.timedelta(days=6)).weekday()])
T("Agenda", project_id=gen, parent_task_id=weekly, estimate_minutes=15)
T("Minutes", project_id=gen, parent_task_id=weekly)
T("Hang the shelves", project_id=flat)
T("Fix kitchen tap", project_id=flat, status="done")
T("Book booth", project_id=fair, status="done")
T("Print flyers", project_id=fair, status="done")
c.put(f"/api/projects/{fair}", json={"archived": True}, headers=H)
T("Renew passport", priority=1, deadline=day(12))

# Comments and notifications for "preview", mostly caused by anna.
c.post(f"/api/tasks/{t1}/comments", json={"body": "Asked the lab how many we need."}, headers=H)
c.post(f"/api/tasks/{t1}/comments", json={"body": "Supplier confirmed 3 weeks lead time for 40 units."}, headers=Hanna)
c.post(f"/api/tasks/{t1}/comments", json={"body": "Lab says 40 is right — @preview, go ahead and order."}, headers=Hanna)
c.post(f"/api/tasks/{kickoff}/comments", json={"body": "Notes are in the shared folder."}, headers=Hanna)
c.put(f"/api/tasks/{guide}", json={"assignee_id": me}, headers=Hanna)
c.put(f"/api/tasks/{guide}", json={"blocked_by_ids": [demo, t1]}, headers=H)
c.post(f"/api/tasks/{guide}/comments", json={"body": "@preview I can do the photos."}, headers=Hanna)
# History for t1: anna raises the priority, preview takes it on.
c.put(f"/api/tasks/{t1}", json={"priority": 3}, headers=Hanna)
c.put(f"/api/tasks/{t1}", json={"status": "in_progress", "assignee_id": me}, headers=H)
# Several at once by anna: one notification "… and 2 more tasks".
c.post("/api/tasks/bulk", json={"items": [{"title": "Prepare demo room"}, {"title": "Invite partners"}, {"title": "Book catering"}],
                                "project_id": gen, "assignee_id": me}, headers=Hanna)

c.put(f"/api/v1/pins/{guide}", headers=H)
c.post(f"/api/v1/projects/{hub}/share", headers=H)
c.post("/api/v1/templates/", json={"name": "Demo setup", "task_id": demo}, headers=H)
c.post("/api/v1/saved-filters/", json={"name": "Hardware", "query": f"label={hw}"}, headers=H)
c.post("/api/v1/saved-filters/", json={"name": "Mine by deadline", "query": "assignee=me&sort=deadline"}, headers=H)
W = lambda name, color: c.post("/api/v1/workspaces/", json={"name": name, "color": color}, headers=H).json()["id"]  # noqa: E731
ws_work, ws_private = W("Work", "#2196f3"), W("Private", "#4caf50")
for pid, wid in ((hub, ws_work), (fair, ws_work), (flat, ws_private)):
    c.put(f"/api/v1/workspaces/projects/{pid}", json={"workspace_id": wid}, headers=H)

# Spread the history out, so "time ago" texts look real.
eng = create_engine(f"postgresql+psycopg://postgres@127.0.0.1:{port}/pmui")
with eng.begin() as conn:
    conn.execute(text("update tasks set completed_at = now() - interval '45 days' where id = :i"), {"i": old})
    conn.execute(text("update task_comments set created_at = now() - interval '5 hours' where author_id = (select id from users where username='anna')"))
    conn.execute(text("update task_comments set created_at = now() - interval '2 hours' where author_id = (select id from users where username='preview')"))
    conn.execute(text("update task_comments set created_at = now() - interval '1 days' where body like 'Notes are%'"))
    conn.execute(text("update task_comments set created_at = now() - interval '20 minutes' where body like 'Lab says%'"))
    conn.execute(text("update task_activity set created_at = now() - interval '6 hours' where kind = 'created'"))
    conn.execute(text("update task_activity set created_at = now() - interval '4 hours' where kind = 'priority'"))
    conn.execute(text("update task_activity set created_at = now() - interval '1 hours' where kind in ('status', 'assignee')"))
    conn.execute(text("update notifications set created_at = now() - interval '3 hours' where kind = 'assigned' and excerpt is null"))
    conn.execute(text("update notifications set created_at = now() - interval '20 minutes' where kind = 'comment'"))
    conn.execute(text("update notifications set created_at = now() - interval '5 minutes' where excerpt like 'and%'"))
eng.dispose()

# The sample users' sessions, for tools/screenshots.py.
with open(os.path.join(DATA, "token-preview.txt"), "w") as f:
    f.write(tok)
with open(os.path.join(DATA, "token-anna.txt"), "w") as f:
    f.write(tok_anna)

# ---- the built frontend on the same port ------------------------------------
app.router.routes = [r for r in app.router.routes if getattr(r, "path", None) not in ("/", "/health")]
app.mount("/static", StaticFiles(directory=os.path.join(BUILD, "static")), name="static")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    f = os.path.join(BUILD, path)
    return FileResponse(f if path and os.path.isfile(f) else os.path.join(BUILD, "index.html"))


if __name__ == "__main__":
    import uvicorn

    print(f"Preview on http://localhost:{PORT} (user preview / preview-pass-1)", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
