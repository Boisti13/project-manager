"""My day, the weekly review, German, phones."""
import datetime

from conftest import open_list, row


def test_my_day_tick_off_and_undo(page, api):
    today = datetime.date.today().isoformat() + "T00:00:00"
    api.task("Call the supplier today", assignee_id=api.me["id"], deadline=today)
    page.goto("/today")
    item = page.locator(".myday-task", has_text="Call the supplier today")
    item.locator(".task-done-checkbox").click()
    page.locator(".undo-toast", has_text="Marked “Call the supplier today” done").wait_for()
    page.locator(".undo-btn").click()
    item.wait_for()
    assert api.find("Call the supplier today")["status"] == "todo"


def test_weekly_review_lists_the_week_and_copies_it(page, api):
    project = api.project()
    api.task("Shipped the release", project_id=project["id"], status="done")
    api.task("Still to do", project_id=project["id"], estimate_minutes=120)
    page.goto("/review")
    done = page.locator(".myday-section", has_text="Done")
    done.locator(".myday-title", has_text="Shipped the release").wait_for()
    table_row = page.locator(".review-table tr", has_text=project["name"])
    assert table_row.locator("td").all_inner_texts()[1:] == ["1", "1", "–", "2h"]

    page.get_by_role("button", name="Copy as text").click()
    page.get_by_role("button", name="Copied ✓").wait_for()
    text = page.evaluate("navigator.clipboard.readText()")
    assert text.startswith("Weekly review ")
    assert f"- Shipped the release — {project['name']}" in text

    page.get_by_role("button", name="Previous week").click()
    assert page.locator(".myday-title", has_text="Shipped the release").count() == 0


def test_german_interface(make_page, users):
    anna = users["anna"]
    anna.put("/api/auth/me/preferences", language="de")
    try:
        page = make_page(user="anna")
        page.goto("/")
        page.locator(".nav-link", has_text="Aufgaben").wait_for()
        page.get_by_role("button", name="+ Neue Aufgabe").wait_for()
    finally:
        anna.put("/api/auth/me/preferences", language="en")


def test_phone_layout_and_task_menu(make_page, api):
    project = api.project()
    api.task("On the go", project_id=project["id"])
    page = make_page(phone=True)
    open_list(page, project)
    nav = page.locator(".nav-links")
    box = nav.bounding_box()
    assert box["y"] + box["height"] >= 844 - 2  # tab bar at the bottom
    assert not row(page, "On the go").locator(".edit-btn").is_visible()  # in the ⋯ menu instead
    row(page, "On the go").locator(".menu-btn").click()
    menu = page.locator(".task-menu-list")
    assert "Delete" in menu.inner_text() and "Edit" in menu.inner_text()
