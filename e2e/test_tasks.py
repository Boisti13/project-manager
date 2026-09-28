"""The task list: create, edit, estimates, done, delete, undo, keyboard."""
import re

from conftest import open_list, row, wait_for


def test_log_in_and_create_a_task_with_enter(make_page, api):
    project = api.project()
    page = make_page(logged_in=False)
    page.goto("/login")
    page.locator(".login-card input").first.fill("admin")
    page.locator(".login-card input[type=password]").fill("e2e-password-1")
    page.locator(".login-card button[type=submit]").click()
    page.wait_for_selector(".task-list")

    open_list(page, project)
    page.get_by_role("button", name="+ New Task").click()
    title = page.locator("input[name=title]")
    assert title.evaluate("el => el === document.activeElement")  # typing can start right away
    title.fill("Order cables")
    title.press("Enter")
    row(page, "Order cables").wait_for()
    assert api.find("Order cables")["project_id"] == project["id"]


def test_edit_opens_below_the_task_and_takes_an_estimate(page, api):
    project = api.project()
    api.task("First", project_id=project["id"])
    api.task("Second", project_id=project["id"])
    open_list(page, project)

    row(page, "Second").locator(".edit-btn").click()
    form = page.locator(".task-item", has_text="Second").first.locator(".inline-form")
    form.wait_for()
    assert form.locator("input[name=title]").input_value() == "Second"

    estimate = form.locator("#task-estimate")
    estimate.fill("abc")
    estimate.press("Control+Enter")
    form.locator(".estimate-error").wait_for()  # not saved: still open, with a hint
    estimate.fill("1,5")
    estimate.press("Control+Enter")
    form.wait_for(state="detached")
    assert row(page, "Second").locator(".task-estimate").inner_text() == "⏱ 1h 30min"
    assert api.find("Second")["estimate_minutes"] == 90
    # the project header adds it up
    assert "1h 30min" in page.locator(".estimate-total").first.inner_text()


def test_delete_with_undo_then_for_real(page, api):
    project = api.project()
    parent = api.task("Tidy up", project_id=project["id"])
    api.task("Sub step", parent_task_id=parent["id"])
    open_list(page, project)

    row(page, "Tidy up").locator(".delete-btn").click()
    toast = page.locator(".undo-toast")
    assert "Deleted “Tidy up” (and one subtask)" in toast.inner_text()
    assert page.locator(".task-item", has_text="Tidy up").count() == 0
    assert api.find("Tidy up")  # not sent yet
    toast.get_by_role("button", name="Undo").click()
    row(page, "Tidy up").wait_for()

    row(page, "Tidy up").locator(".delete-btn").click()
    page.wait_for_timeout(8000)  # the undo time runs out
    assert api.find("Tidy up") == [] and api.find("Sub step") == []


def test_tick_off_with_undo_also_takes_back_the_next_occurrence(page, api):
    project = api.project()
    api.task("Water plants", project_id=project["id"], status="in_progress", recurrence_unit="week",
             deadline="2026-10-01T00:00:00")
    open_list(page, project)

    row(page, "Water plants").locator(".task-done-checkbox").click()
    page.locator(".undo-toast", has_text="Marked “Water plants” done").wait_for()
    wait_for(lambda: len(api.find("Water plants")) == 2)  # the next one was created
    page.locator(".undo-btn").click()
    task = wait_for(lambda: isinstance(api.find("Water plants"), dict) and api.find("Water plants"))
    assert task["status"] == "in_progress"


def test_keyboard_shortcuts(page, api):
    project = api.project()
    for title in ("Alpha", "Beta", "Gamma"):
        api.task(title, project_id=project["id"])
    open_list(page, project)
    page.locator("body").click(position={"x": 5, "y": 5})

    page.keyboard.press("j")
    page.keyboard.press("j")
    current = page.locator(".task-item.kbd-current > .task-header .task-title")
    assert current.inner_text() == "Beta"
    page.keyboard.press("k")
    assert current.inner_text() == "Alpha"
    page.keyboard.press("x")
    wait_for(lambda: api.find("Alpha")["status"] == "done")

    page.keyboard.press("?")
    page.locator(".kbd-help").wait_for()
    page.keyboard.press("Escape")
    page.locator(".kbd-help").wait_for(state="detached")

    page.keyboard.press("n")
    assert page.evaluate("document.activeElement.name") == "title"
    assert page.locator("input[name=title]").input_value() == ""  # the "n" isn't typed into it


def test_search_highlights_matches(page, api):
    project = api.project()
    api.task("Calibrate antenna", project_id=project["id"])
    api.task("Something else", project_id=project["id"])
    open_list(page, project)
    page.locator("input[type=search]").fill("antenna")
    page.wait_for_function("() => document.querySelectorAll('.task-list mark').length > 0")
    assert page.locator(".task-list mark").first.inner_text().lower() == "antenna"
    assert page.locator(".task-item", has_text="Something else").count() == 0
    assert re.search(r"q=antenna", page.url)


def test_description_starts_under_the_title(make_page, api):
    project = api.project()
    parent = api.task("With subtasks", project_id=project["id"], description="Starts under the W")
    api.task("Child", parent_task_id=parent["id"], description="Starts under the C")
    api.task("Plain", project_id=project["id"], description="Starts under the P")

    def offsets(page):
        return page.evaluate("""() => [...document.querySelectorAll('.task-item')].map(item => {
            const title = item.querySelector(':scope > .task-header .task-title').getBoundingClientRect().left;
            const desc = item.querySelector(':scope > .task-description');
            return desc ? Math.round(desc.getBoundingClientRect().left - title) : null;
        })""")

    for phone in (False, True):
        page = make_page(phone=phone)
        open_list(page, project)
        row(page, "Child").wait_for()  # a project filter shows subtasks expanded
        assert [o for o in offsets(page) if o is not None] == [0, 0, 0], (phone, offsets(page))
