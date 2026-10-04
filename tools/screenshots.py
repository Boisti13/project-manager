"""The documentation screenshots (docs/screenshots/*.png), taken from the
local preview with sample data (tools/preview_server.py must be running).

    python tools/screenshots.py                    # all of them
    python tools/screenshots.py tasks-desktop bell-desktop   # just these
    python tools/screenshots.py --list

Uses the installed Chrome (PW_CHANNEL=chrome, the default) or Playwright's
Chromium (PW_CHANNEL=). Fails on JavaScript errors in the page. Only ever
sample data: never point this at a real server.
"""
import json
import os
import sys
import urllib.request

from playwright.sync_api import sync_playwright

TOOLS = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(TOOLS)
OUT = os.path.join(REPO, "docs", "screenshots")
BASE = os.environ.get("PM_PREVIEW_URL", "http://localhost:8765")


def token(user="preview"):
    path = os.path.join(TOOLS, ".preview", f"token-{user}.txt")
    if not os.path.exists(path):
        sys.exit("No preview token -- start tools/preview_server.py first.")
    return open(path).read().strip()


def api(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read() or b"null")


# name, path, viewport, device scale (2 = phone), theme, full page, action
SHOTS = [
    ("tasks-desktop", "/", (1280, 860), 1, "light", False, None),
    ("tasks-desktop-dark", "/", (1280, 860), 1, "dark", False, None),
    ("tasks-filtered", "/?q=order", (1280, 700), 1, "light", False, None),
    ("projects-desktop", "/projects", (1280, 560), 1, "light", False, None),
    ("settings-desktop", "/settings/system", (1280, 1100), 1, "light", True, "updates"),
    ("settings-account-desktop", "/settings/account", (1280, 1000), 1, "light", True, None),
    ("settings-phone", "/settings/integrations", (390, 760), 2, "light", False, None),
    ("tasks-phone", "/", (390, 844), 2, "light", False, None),
    ("tasks-phone-dark", "/", (390, 844), 2, "dark", False, "open-completed"),
    ("projects-phone", "/projects", (390, 844), 2, "light", False, None),
    ("comments-desktop", "/", (1100, 900), 1, "light", False, "comments"),
    ("comments-phone", "/", (390, 844), 2, "light", False, "comments"),
    ("login-phone", "/login", (390, 844), 2, "light", False, "anonymous"),
    ("bulk-desktop", "/", (1200, 950), 1, "light", False, "bulk"),
    ("bulk-quick-desktop", "/", (1280, 900), 1, "light", False, "bulk-quick"),
    ("quick-entry-desktop", "/", (1280, 900), 1, "light", False, "quick-entry"),
    ("menu-phone", "/", (390, 844), 2, "light", False, "menu"),
    ("board-desktop", "/?view=board", (1280, 820), 1, "light", False, None),
    ("calendar-desktop", "/?view=calendar", (1280, 1060), 1, "light", False, None),
    ("calendar-phone", "/?view=calendar", (390, 844), 2, "light", True, None),
    ("timeline-desktop", "/?view=timeline", (1280, 900), 1, "light", False, None),
    ("timeline-phone", "/?view=timeline", (390, 844), 2, "light", False, None),
    ("project-private-desktop", "/projects", (1100, 900), 1, "light", False, "private-form"),
    ("myday-desktop", "/today", (1280, 1240), 1, "light", False, None),
    ("myday-phone", "/today", (390, 844), 2, "light", False, None),
    ("myday-de-phone", "/today", (390, 844), 2, "light", False, "german"),
    ("shortcuts-desktop", "/", (1100, 760), 1, "light", False, "keys"),
    ("review-desktop", "/review", (1280, 1000), 1, "light", False, None),
    ("review-phone", "/review", (390, 844), 2, "light", False, None),
    ("template-desktop", "/", (1200, 900), 1, "light", False, "template"),
    ("undo-desktop", "/", (1200, 700), 1, "light", False, "undo"),
    ("bulk-edit-desktop", "/", (1200, 760), 1, "light", False, "select"),
    ("bulk-edit-phone", "/", (390, 844), 2, "light", False, "select"),
    ("markdown-desktop", "/", (1100, 700), 1, "light", False, "markdown"),
    ("mention-desktop", "/", (1100, 900), 1, "light", False, "mention"),
    ("projects-share-desktop", "/projects", (1280, 1000), 1, "light", True, "share"),
    ("shared-desktop", "/login", (1100, 900), 1, "light", False, "shared"),
    ("shared-phone", "/login", (390, 844), 2, "light", False, "shared"),
    ("workspaces-desktop", "/", (1280, 760), 1, "light", False, "workspace-private"),
    ("workspaces-phone", "/", (390, 760), 2, "light", False, "workspace-private"),
    ("workspaces-settings", "/settings/workspaces", (1280, 900), 1, "light", False, "workspaces-section"),
    ("two-factor-desktop", "/settings/account", (1280, 900), 1, "light", False, "two-factor"),
    ("home-assistant-settings", "/settings/integrations", (1280, 900), 1, "light", False, "home-assistant"),
    # last: opening the bell marks the notifications read
    ("bell-desktop", "/", (1200, 700), 1, "light", False, "bell"),
    ("bell-workspace-desktop", "/", (1280, 900), 1, "light", False, "bell-workspace"),
]


def shot(page, ctx, name, path, full, action):
    """Takes screenshot `name`; most actions set something up first."""
    out = os.path.join(OUT, name + ".png")
    if action == "updates":
        page.wait_for_function("document.querySelectorAll('.update-branch option').length > 0", timeout=20000)
    if action == "open-completed":
        page.locator(".completed-toggle").first.click()
        page.wait_for_timeout(200)
    if action == "menu":
        page.locator(".task-item", has_text="Order antenna modules").first.locator(".menu-btn").first.tap()
        page.locator(".task-menu-list").wait_for()
        page.wait_for_timeout(200)
        return page.screenshot(path=out)
    if action == "template":
        page.locator("text=+ New Task").first.click()
        page.locator("[role=tab]", has_text="From template").click()
        page.locator("select[name=project_id]").select_option(label="General")
        page.wait_for_timeout(200)
        return page.locator(".form-container").screenshot(path=out)
    if action == "select":
        page.locator(".mine-toggle", has_text="Select").click()
        for title in ("Kick-off meeting notes", "Write setup guide"):
            page.locator(".task-item", has_text=title).first.locator(":scope > .task-header").click()
        page.locator(".bulk-bar").evaluate("el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8)")
        page.wait_for_timeout(300)
        return page.screenshot(path=out)
    if action == "markdown":
        return page.locator(".task-item", has_text="Order antenna modules").first.screenshot(path=out)
    if action == "mention":
        item = page.locator(".task-item", has_text="Order antenna modules").first
        item.locator(":scope > .task-header .comment-btn").click()
        box = item.locator(".comment-new textarea")
        box.wait_for()
        box.click()
        page.keyboard.type("Thanks @a")
        page.locator(".mention-list").wait_for()
        page.wait_for_timeout(200)
        # The suggestions open below the input, often below the window:
        # clip from the whole page, in page coordinates.
        b, lst = item.locator(".task-comments").bounding_box(), page.locator(".mention-list").bounding_box()
        y0 = page.evaluate("window.scrollY")
        top = b["y"] + b["height"] - 260
        bottom = max(lst["y"] + lst["height"], b["y"] + b["height"]) + 8
        return page.screenshot(path=out, full_page=True, clip={"x": b["x"], "y": y0 + top, "width": b["width"], "height": bottom - top})
    if action == "share":
        page.locator(".project-item", has_text="6GHub").locator(".share-btn").first.click()
        page.locator(".project-share").wait_for()
        page.locator(".archived-projects .completed-toggle").click()
        page.wait_for_timeout(300)
        return page.screenshot(path=out, full_page=True)
    if action == "shared":
        share = [x for x in api("GET", "/api/projects/") if x["name"] == "6GHub"][0]["share_token"]
        page.goto(BASE + "/share/" + share)
        page.locator(".shared-head").wait_for()
        page.wait_for_timeout(400)
        return page.screenshot(path=out)
    if action == "undo":
        page.locator(".task-item", has_text="Write setup guide").first.locator(":scope > .task-header .delete-btn").click()
        page.locator(".undo-toast").wait_for()
        page.wait_for_timeout(300)
        page.screenshot(path=out)
        page.locator(".undo-btn").click()
        return page.wait_for_timeout(500)
    if action == "keys":
        page.locator("body").click(position={"x": 5, "y": 5})
        page.keyboard.press("j")
        page.keyboard.press("?")
        page.locator(".kbd-help").wait_for()
        page.wait_for_timeout(200)
        return page.screenshot(path=out)
    if action == "bell":
        page.locator(".bell-btn").click()
        page.locator(".bell-dropdown").wait_for()
        page.wait_for_timeout(200)
        return page.locator(".bell-dropdown").screenshot(path=out)
    if action == "bulk":
        page.locator(".category-group", has_text="ORDERING").first.locator(".category-header .task-action-btn").click()
        page.locator("text=Several (one per line)").click()
        page.locator("#bulk-text").fill("\n".join([
            "Order test equipment", "  Spectrum analyzer", "  Calibration kit",
            "    Check warranty", "Book courier", "- [x] Ask for quote"]))
        page.wait_for_timeout(200)
        return page.locator(".form-container").screenshot(path=out)
    if action == "bulk-quick":
        page.get_by_role("button", name="+ New Task").first.click()
        page.get_by_role("tab", name="Several (one per line)").click()
        page.locator("#bulk-text").fill("Trade fair 2027 from 5.10. to 9.10. !high #hardware\n  Book booth tomorrow @anna\n"
                                        "  Ship demo kit 1.10.\nWeekly prep call every monday\nPrint flyers")
        page.locator(".bulk-quick").nth(3).wait_for()
        page.wait_for_timeout(300)
        b = page.locator(".bulk-entry").bounding_box()
        return page.screenshot(path=out, clip={"x": b["x"] - 8, "y": b["y"] - 8, "width": b["width"] + 16, "height": b["height"] + 16})
    if action == "quick-entry":
        page.get_by_role("button", name="+ New Task").first.click()
        page.locator(".task-form input[name=title]").fill("Call supplier about delivery friday !high #waiting @anna")
        page.locator(".quick-chip").nth(3).wait_for()
        page.wait_for_timeout(300)
        b = page.locator(".task-form").bounding_box()
        return page.screenshot(path=out, clip={"x": b["x"] - 8, "y": b["y"] - 8, "width": b["width"] + 16, "height": 240})
    if action == "private-form":
        page.locator(".project-item", has_text="Apartment").locator(".edit-btn").first.click()
        page.locator(".form-container").wait_for()
        page.wait_for_timeout(200)
        return page.locator(".form-container").screenshot(path=out)
    if action == "german":
        set_lang = """(lang) => fetch('/api/auth/me/preferences', {method: 'PUT',
            headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token')},
            body: JSON.stringify({language: lang})})"""
        page.evaluate(set_lang, "de")
        page.reload()
        page.wait_for_selector(".myday-section")
        page.wait_for_timeout(400)
        page.screenshot(path=out)
        return page.evaluate(set_lang, None)
    if action == "comments":
        row = page.locator(".task-item", has_text="Order antenna modules").first
        row.locator(".comment-btn").first.click()
        row.locator(".task-comments .comment").first.wait_for()
        return row.screenshot(path=out)
    if action == "workspace-private":
        page.wait_for_selector(".workspace-switcher")
        page.locator(".workspace-switcher").select_option(label="Private")
        page.wait_for_timeout(500)
        return page.screenshot(path=out)
    if action == "workspaces-section":
        sec = page.locator(".settings-section", has_text="Your projects")
        sec.wait_for()
        page.wait_for_timeout(300)
        return sec.screenshot(path=out)
    if action == "two-factor":
        sec = page.locator(".settings-section", has_text="Two-factor login").first
        sec.get_by_role("button", name="Set up two-factor login").click()
        sec.locator(".twofa-qr svg").wait_for()
        page.wait_for_timeout(300)
        sec.screenshot(path=out)
        return sec.get_by_role("button", name="Cancel").click()  # nothing is switched on
    if action == "home-assistant":
        # A sample broker address (192.0.2.x is reserved for documentation).
        api("PUT", "/api/v1/home-assistant/mqtt", {"enabled": True, "host": "192.0.2.10", "username": "project-manager",
                                                   "password": "sample", "app_url": "http://192.168.100.113"})
        api("PUT", "/api/v1/home-assistant/me", {"enabled": True})
        try:
            page.reload()
            sec = page.locator(".settings-section", has_text="Let Home Assistant fetch them")
            sec.locator(".ha-broker").wait_for()
            page.wait_for_timeout(4000)
            return sec.screenshot(path=out)
        finally:
            api("PUT", "/api/v1/home-assistant/me", {"enabled": False})
            api("PUT", "/api/v1/home-assistant/mqtt", {"enabled": False})
    if action == "bell-workspace":
        # Showing "Private", the lab's notifications are in "Work".
        page.locator(".workspace-switcher").select_option(label="Private")
        page.wait_for_timeout(300)
        page.locator(".bell-btn").click()
        page.locator(".bell-dropdown").wait_for()
        page.wait_for_timeout(300)
        d = page.locator(".bell-dropdown").bounding_box()
        return page.screenshot(path=out, clip={"x": d["x"] - 8, "y": 0, "width": d["width"] + 16,
                                               "height": min(d["y"] + d["height"] + 8, 900)})
    return page.screenshot(path=out, full_page=full)


def main(names):
    if names == ["--list"]:
        print("\n".join(s[0] for s in SHOTS))
        return
    shots = [s for s in SHOTS if not names or s[0] in names]
    unknown = set(names) - {s[0] for s in SHOTS}
    if unknown:
        sys.exit(f"Unknown: {', '.join(sorted(unknown))} (see --list)")
    os.makedirs(OUT, exist_ok=True)
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel=os.environ.get("PW_CHANNEL", "chrome") or None)
        for name, path, (w, h), dpr, theme, full, action in shots:
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=dpr, locale="en-US",
                                      is_mobile=dpr > 1, has_touch=dpr > 1)
            if action in ("anonymous", "shared"):
                ctx.add_init_script(f"localStorage.setItem('theme', {theme!r});")
            else:
                ctx.add_init_script(f"localStorage.setItem('token', {token()!r}); localStorage.setItem('theme', {theme!r});")
            page = ctx.new_page()
            page.on("pageerror", lambda e, n=name: errors.append(f"{n}: {e}"))
            page.goto(BASE + path)
            page.wait_for_selector(".login-card" if action in ("anonymous", "shared") else ".container h1")
            page.wait_for_timeout(600)
            shot(page, ctx, name, path, full, action)
            ctx.close()
            print("saved", name)
        browser.close()
    if errors:
        sys.exit("JavaScript errors:\n" + "\n".join(errors))


if __name__ == "__main__":
    main(sys.argv[1:] or [n for n in os.environ.get("ONLY", "").split(",") if n])
