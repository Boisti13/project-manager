"""Quick entry in the task form, two-factor login, calendar feed per workspace."""
import base64
import hashlib
import hmac
import struct
import time

from conftest import PASSWORD, open_list, row, wait_for


def totp(secret, step=None):
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    step = int(time.time() // 30) if step is None else step
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    o = digest[-1] & 15
    return str((struct.unpack(">I", digest[o:o + 4])[0] & 0x7FFFFFFF) % 1000000).zfill(6)


def test_quick_entry_sets_date_priority_label_and_assignee(page, api, users):
    project = api.project()
    label = api.post("/api/v1/labels/", name=f"qe-{project['id']}", color="#795548")
    open_list(page, project)
    page.get_by_role("button", name="+ New Task").first.click()
    title = page.locator(".task-form input[name=title]")
    title.fill(f"Call supplier tomorrow !high #{label['name']} @anna")
    chips = page.locator(".quick-chip")
    chips.nth(3).wait_for()
    assert chips.count() == 4
    # keep a word that was picked up by mistake: "monday" stays in the title
    title.fill("Prepare monday meeting")
    page.locator(".quick-chip").first.locator("button").click()
    assert page.locator(".quick-chip").count() == 0
    title.fill(f"Prepare monday meeting tomorrow !high #{label['name']} @anna")
    title.press("Enter")

    task = wait_for(lambda: [t for t in api.tasks() if t["title"] == "Prepare monday meeting"])[0]
    assert task["priority"] == 2 and task["label_ids"] == [label["id"]]
    assert task["assignee_id"] == users["anna"].me["id"]
    assert task["deadline"] is not None
    row(page, "Prepare monday meeting").wait_for()


def test_two_factor_login(make_page, users):
    anna = users["anna"]
    page = make_page(user="anna")
    try:
        page.goto("/settings")
        page.get_by_role("button", name="Set up two-factor login").click()
        secret = page.locator(".twofa-secret").inner_text().strip()
        assert page.locator(".twofa-qr svg").count() == 1
        page.get_by_label("Code from your authenticator app").fill(totp(secret))
        page.get_by_role("button", name="Turn on").click()
        codes = page.locator(".twofa-codes li")
        codes.first.wait_for()
        recovery = codes.first.inner_text().strip()
        assert codes.count() == 10
        page.get_by_role("button", name="I’ve saved them").click()
        page.get_by_text("Two-factor login is on.").wait_for()

        # log in again: the password alone asks for the code
        fresh = make_page(logged_in=False)
        fresh.goto("/login")
        fresh.get_by_label("Username").fill("anna")
        fresh.get_by_label("Password").fill(PASSWORD)
        fresh.locator(".login-card button[type=submit]").click()
        fresh.get_by_label("Code from your authenticator app").fill("000000")
        fresh.locator(".login-card button[type=submit]").click()
        fresh.locator(".error-message", has_text="Wrong two-factor code").wait_for()
        fresh.get_by_label("Code from your authenticator app").fill(recovery)
        fresh.locator(".login-card button[type=submit]").click()
        fresh.locator(".app-nav").wait_for()
    finally:
        anna.post("/api/v1/auth/2fa/disable", password=PASSWORD)


def test_calendar_feed_link_per_workspace(page, api):
    ws = api.post("/api/v1/workspaces/", name="FeedWS")
    try:
        page.goto("/settings")
        section = page.locator(".settings-section", has_text="Calendar feed")
        section.get_by_label("Workspace").select_option(label="FeedWS")
        link = section.locator(".feed-link code")
        wait_for(lambda: f"workspace={ws['id']}" in link.inner_text())
        assert link.inner_text().endswith(f".ics?workspace={ws['id']}")
    finally:
        api.call("DELETE", f"/api/v1/workspaces/{ws['id']}")
