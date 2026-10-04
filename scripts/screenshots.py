"""Re-take the screenshots in docs/screenshots/ that show the whole page
(top bar included) from a fresh, empty instance filled with sample data.

    python scripts/screenshots.py http://localhost:8099 [name ...]

The instance must be new (no users yet): the script registers "preview"
(admin) and "anna", fills in projects, tasks, labels, comments and
notifications through the API (dates relative to today), then captures each
page with Playwright in English at fixed window sizes, light mode unless the
name says -dark. A throwaway instance: e2e/serve.py on an empty database
(see docs/development.md#screenshots). Never point it at real data.

Names limit the run to those screenshots (the data is only seeded once:
pass --no-seed on a second run against the same instance). Close-ups (bell,
mention, quick entry, ...) aren't covered; take those by hand.

Needs: pip install playwright && playwright install chromium
"""
import json
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, time, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "screenshots"
PASSWORD = "preview-password-1"


class Api:
    def __init__(self, base, token=None):
        self.base, self.token = base.rstrip("/") + "/api/v1", token

    def call(self, method, path, body=None, form=None):
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        data = None
        if form is not None:
            data = urllib.parse.urlencode(form).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        elif body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req) as r:
                raw = r.read()
        except urllib.error.HTTPError as e:
            sys.exit(f"{method} {path}: {e.code} {e.read().decode()[:300]}")
        return json.loads(raw) if raw else None

    def login(self, username):
        token = self.call("POST", "/auth/login", form={"username": username, "password": PASSWORD})["access_token"]
        return Api(self.base[: -len("/api/v1")], token)


def day(offset):
    return datetime.combine(date.today() + timedelta(days=offset), time()).isoformat()


def seed(base):
    """Sample data; returns the login token of "preview"."""
    anon = Api(base)
    anon.call("POST", "/auth/register", {"username": "preview", "email": "preview@example.com", "password": PASSWORD})
    me = anon.login("preview")
    me_id = me.call("GET", "/auth/me")["id"]
    anna_id = me.call("POST", "/users/", {"username": "anna", "email": "anna@example.com", "password": PASSWORD})["id"]
    anna = anon.login("anna")

    label = {
        name: me.call("POST", "/labels/", {"name": name, "color": color})["id"]
        for name, color in [("urgent", "#f44336"), ("hardware", "#795548"), ("waiting for supplier", "#ff9800")]
    }

    def project(name, color, parent=None, **kw):
        return me.call("POST", "/projects/", {"name": name, "color": color, "parent_id": parent, **kw})["id"]

    hub = project("6GHub", "#2196f3", description="Demonstrator for the 6G research hub")
    docs = project("Documentation", "#2196f3", hub)
    general = project("General", "#2196f3", hub)
    ordering = project("Ordering", "#2196f3", hub)
    flat = project("Apartment", "#4caf50", is_private=True, member_ids=[me_id])
    fair = project("Trade fair 2025", "#ff9800")

    def task(title, api=me, **kw):
        return api.call("POST", "/tasks/", {"title": title, **kw})["id"]

    kickoff = task("Kick-off meeting notes", project_id=hub, assignee_id=me_id, priority=2, estimate_minutes=60, status="in_progress",
                   start_date=day(-13), deadline=day(-4), label_ids=[label["urgent"]])
    antenna = task("Order antenna modules", project_id=ordering, assignee_id=me_id, priority=3, status="in_progress",
                   start_date=day(-20), deadline=day(-14), label_ids=[label["hardware"], label["waiting for supplier"]],
                   description="Lab says 40 is right; supplier confirmed the **final quantities**.")
    task("Check supplier quote", project_id=ordering, parent_task_id=antenna, status="done", estimate_minutes=30)
    task("Confirm delivery date", project_id=ordering, parent_task_id=antenna, estimate_minutes=30)
    task("Call supplier about delivery", project_id=ordering, assignee_id=me_id, priority=2, deadline=day(0),
         label_ids=[label["waiting for supplier"]])
    task("Order power supplies", project_id=ordering, status="done", priority=1)
    task("Order cables", project_id=ordering, status="done", assignee_id=anna_id)
    demo = task("Prepare demo setup", project_id=docs, assignee_id=me_id, priority=1, estimate_minutes=90, start_date=day(-6),
                deadline=day(-2), label_ids=[label["hardware"]])
    task("Set up the laptop", project_id=docs, parent_task_id=demo, status="done")
    task("Charge the batteries", project_id=docs, parent_task_id=demo, status="done")
    guide = task("Write setup guide", project_id=docs, assignee_id=me_id, estimate_minutes=240, start_date=day(1), deadline=day(5),
                 blocked_by_ids=[antenna, demo], description="Step by step, with photos of the demo setup.")
    task("Weekly sync", project_id=general, priority=1, deadline=day(-6), recurrence_unit="week",
         recurrence_interval=1, recurrence_weekdays=[(date.today() - timedelta(days=6)).weekday()])
    task("Invite partners", project_id=general)
    task("Book catering", project_id=general, assignee_id=anna_id)
    # Assigned by anna: notifications for preview.
    task("Prepare demo room", api=anna, project_id=general, assignee_id=me_id)

    task("Fix kitchen tap", project_id=flat, status="done")
    task("Hang the shelves", project_id=flat)
    task("Book booth", project_id=fair, status="done")
    task("Print flyers", project_id=fair, status="done")
    me.call("PUT", f"/projects/{fair}", {"archived": True})
    task("Renew passport", priority=1, deadline=day(12))

    for api, body in [
        (me, "Asked the lab how many we need."),
        (anna, "Lab says 40 is right — @preview, go ahead and order."),
        (anna, "Supplier confirmed 3 weeks lead time for 40 units."),
    ]:
        api.call("POST", f"/tasks/{antenna}/comments", {"body": body})
    anna.call("POST", f"/tasks/{kickoff}/comments", {"body": "Notes are in the shared folder."})
    anna.call("POST", f"/tasks/{guide}/comments", {"body": "@preview I can do the photos."})

    me.call("PUT", f"/pins/{guide}")
    work = me.call("POST", "/workspaces/", {"name": "Work", "color": "#2196f3"})["id"]
    home = me.call("POST", "/workspaces/", {"name": "Private", "color": "#4caf50"})["id"]
    for p, ws in [(hub, work), (fair, work), (flat, home)]:
        me.call("PUT", f"/workspaces/projects/{p}", {"workspace_id": ws})
    me.call("POST", "/saved-filters/", {"name": "Hardware", "query": f"label={label['hardware']}"})
    me.call("POST", "/saved-filters/", {"name": "Mine by deadline", "query": "assignee=me&sort=deadline"})
    return me


DESKTOP = {"width": 1280, "height": 860}
PHONE = {"width": 390, "height": 844}

# name: (path, viewport, options). Phones are taken at 2x.
SHOTS = {
    "tasks-desktop": ("/", DESKTOP, {}),
    "tasks-desktop-dark": ("/", DESKTOP, {"dark": True}),
    "tasks-filtered": ("/?q=order", {"width": 1280, "height": 700}, {}),
    "board-desktop": ("/?view=board", {"width": 1280, "height": 820}, {}),
    "calendar-desktop": ("/?view=calendar", {"width": 1280, "height": 1060}, {}),
    "timeline-desktop": ("/?view=timeline", {"width": 1280, "height": 900}, {}),
    "myday-desktop": ("/today", {"width": 1280, "height": 1240}, {}),
    "projects-desktop": ("/projects", {"width": 1280, "height": 560}, {}),
    "projects-share-desktop": ("/projects", {"width": 1280, "height": 1030}, {"share": True}),
    "review-desktop": ("/review", {"width": 1280, "height": 1000}, {}),
    "settings-desktop": ("/settings/system", {"width": 1280, "height": 1100}, {}),
    "settings-account-desktop": ("/settings/account", {"width": 1280, "height": 1110}, {}),
    "workspaces-desktop": ("/", {"width": 1280, "height": 760}, {"workspace": "Private"}),
    "shortcuts-desktop": ("/", {"width": 1100, "height": 760}, {"keys": ["j", "?"]}),
    "tasks-phone": ("/", PHONE, {}),
    "tasks-phone-dark": ("/", PHONE, {"dark": True}),
    "myday-phone": ("/today", PHONE, {}),
    "myday-de-phone": ("/today", PHONE, {"language": "de"}),
    "projects-phone": ("/projects", PHONE, {}),
    "review-phone": ("/review", PHONE, {}),
    "timeline-phone": ("/?view=timeline", PHONE, {}),
    "calendar-phone": ("/?view=calendar", {"width": 390, "height": 994}, {}),
    "settings-phone": ("/settings/integrations", {"width": 390, "height": 760}, {}),
    "workspaces-phone": ("/", {"width": 390, "height": 760}, {"workspace": "Private"}),
}


def capture(base, me, names):
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for name in names:
            path, viewport, opt = SHOTS[name]
            if opt.get("language"):
                me.call("PUT", "/auth/me/preferences", {"language": opt["language"]})
            if opt.get("share"):
                hub = next(p for p in me.call("GET", "/projects/") if p["name"] == "6GHub")
                me.call("POST", f"/projects/{hub['id']}/share")
            phone = viewport["width"] < 600
            ctx = browser.new_context(viewport=viewport, device_scale_factor=2 if phone else 1, locale="en-US",
                                      is_mobile=phone, has_touch=phone,
                                      color_scheme="dark" if opt.get("dark") else "light")
            ctx.add_init_script(
                f"localStorage.setItem('token', {json.dumps(me.token)});"
                f"localStorage.setItem('theme', {json.dumps('dark' if opt.get('dark') else 'light')});"
            )
            page = ctx.new_page()
            page.goto(base + path)
            page.wait_for_selector(".app-nav")
            page.wait_for_load_state("networkidle")
            if opt.get("workspace"):
                page.select_option(".workspace-switcher", label=opt["workspace"])
                page.wait_for_load_state("networkidle")
            for key in opt.get("keys", []):
                page.keyboard.press(key)
            if opt.get("share"):
                page.click(".share-btn.active")
                page.wait_for_selector("text=Stop sharing")
            page.wait_for_timeout(600)
            page.screenshot(path=str(OUT / f"{name}.png"))
            ctx.close()
            if opt.get("language"):
                me.call("PUT", "/auth/me/preferences", {"language": None})
            if opt.get("share"):
                me.call("DELETE", f"/projects/{hub['id']}/share")
            print(f"{name}.png")
        browser.close()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    base, names = args[0].rstrip("/"), args[1:] or list(SHOTS)
    unknown = set(names) - set(SHOTS)
    if unknown:
        sys.exit(f"unknown: {', '.join(sorted(unknown))}")
    me = Api(base).login("preview") if "--no-seed" in sys.argv else seed(base)
    capture(base, me, names)


if __name__ == "__main__":
    main()
