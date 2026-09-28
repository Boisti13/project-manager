"""Saved filters, changing several tasks at once, templates."""
from conftest import open_list, row, wait_for


def test_saved_filter(page, api):
    project = api.project()
    name = f"Blocked in {project['name']}"
    page.on("dialog", lambda d: d.accept(name))
    open_list(page, project)

    page.locator("#f-status").select_option("blocked")
    page.locator(".saved-filter-save").click()
    active = page.locator(".saved-filter.active")
    active.wait_for()
    assert name in active.inner_text()

    page.goto("/")
    page.wait_for_selector(".task-list")
    page.locator(".saved-filter-apply", has_text=name).click()
    page.wait_for_function("() => location.search.includes('status=blocked')")
    assert f"project={project['id']}" in page.url

    page.locator(".saved-filter.active .saved-filter-delete").click()
    page.locator(".saved-filter-apply", has_text=name).wait_for(state="detached")
    assert name not in [f["name"] for f in api.get("/api/v1/saved-filters/")]


def test_change_several_tasks_at_once(page, api, users):
    project = api.project()
    for title, prio in (("One", 0), ("Two", 1), ("Three", 2), ("Four", 0)):
        api.task(title, project_id=project["id"], priority=prio)
    open_list(page, project)

    page.locator(".mine-toggle", has_text="Select").click()
    row(page, "One").click()
    row(page, "Three").click(modifiers=["Shift"])  # One to Three
    count = page.locator(".bulk-bar-head strong")
    assert count.inner_text() == "3 selected"

    page.locator('.bulk-bar select[aria-label="Set priority"]').select_option(label="Critical")
    page.locator(".undo-toast", has_text="Changed 3 tasks").wait_for()
    wait_for(lambda: [api.find(t)["priority"] for t in ("One", "Two", "Three", "Four")] == [3, 3, 3, 0])
    page.locator(".undo-btn").click()  # each gets back its own
    wait_for(lambda: [api.find(t)["priority"] for t in ("One", "Two", "Three")] == [0, 1, 2])

    # all or nothing: anna isn't a member of a private project
    secret = api.project(is_private=True)
    page.locator('.bulk-bar select[aria-label="Assign to"]').select_option(label="anna")
    wait_for(lambda: api.find("One")["assignee_id"] == users["anna"].me["id"])
    page.locator('.bulk-bar select[aria-label="Move to project"]').select_option(value=str(secret["id"]))
    page.locator(".error-message", has_text="isn't a member").wait_for()
    assert api.find("One")["project_id"] == project["id"]

    # delete the selection, undo, then leave select mode with Esc
    page.locator(".bulk-bar-delete").click()
    page.locator(".undo-toast", has_text="Deleted 3 tasks").wait_for()
    assert page.locator(".task-item", has_text="Two").count() == 0
    page.locator(".undo-btn").click()
    row(page, "Two").wait_for()
    assert count.inner_text() == "3 selected"  # selected again
    page.locator(".container h1").click()  # out of the bar's lists: keys work again
    page.keyboard.press("Escape")
    page.locator(".bulk-bar").wait_for(state="detached")
    assert page.locator(".task-done-checkbox").count() == 4


def test_template_save_and_use(page, api):
    project = api.project()
    other = api.project()
    name = f"Checklist {project['name']}"
    page.on("dialog", lambda d: d.accept(name))
    root = api.task("Monthly check", project_id=project["id"], estimate_minutes=60)
    api.task("Backups", parent_task_id=root["id"])
    api.task("Updates", parent_task_id=root["id"], status="done")
    open_list(page, project)

    row(page, "Monthly check").locator(".menu-btn").click()
    page.get_by_role("menuitem", name="Save as template…").click()
    page.locator(".undo-toast", has_text=f"Saved as template “{name}”").wait_for()

    open_list(page, other)
    page.get_by_role("button", name="+ New Task").click()
    page.get_by_role("tab", name="From template").click()
    page.locator("#template-pick").select_option(label=name)
    page.locator("#template-title").fill("October check")
    assert page.locator(".bulk-preview").inner_text().split("\n")[1:] == ["October check", "Backups", "Updates"]
    page.get_by_role("button", name="Create 3 tasks").click()
    row(page, "October check").wait_for()

    made = [t for t in api.tasks() if t["title"] in ("October check", "Backups", "Updates") and t["project_id"] == other["id"]]
    assert sorted(t["title"] for t in made) == ["Backups", "October check", "Updates"]
    assert {t["status"] for t in made} == {"todo"}  # everything starts fresh


def test_mention_someone_in_a_comment(page, api, users):
    project = api.project()
    task = api.task("Check the quote", project_id=project["id"])
    open_list(page, project)
    row(page, "Check the quote").locator(".comment-btn").click()
    box = page.locator(".comment-new textarea")
    box.click()
    page.keyboard.type("Please look @an")
    suggestion = page.locator(".mention-list li", has_text="@anna")
    suggestion.wait_for()
    page.keyboard.press("Enter")  # picks the suggestion, doesn't send
    assert box.input_value() == "Please look @anna "
    page.keyboard.type("today")
    page.keyboard.press("Control+Enter")
    page.locator(".comment-body .md-mention", has_text="@anna").wait_for()
    notes = users["anna"].get("/api/v1/notifications/")["items"]
    assert any(n["kind"] == "mention" and n["task_id"] == task["id"] for n in notes)


def test_pin_a_task_to_my_day(page, api):
    project = api.project()
    api.task("Keep an eye on this", project_id=project["id"])
    open_list(page, project)
    row(page, "Keep an eye on this").locator(".menu-btn").click()
    page.get_by_role("menuitem", name="Pin to My day").click()
    row(page, "Keep an eye on this").locator(".task-pin").wait_for()
    tid = api.find("Keep an eye on this")["id"]
    wait_for(lambda: tid in api.get("/api/v1/pins/"))

    page.goto("/today")
    pinned = page.locator(".myday-pinned")
    pinned.locator(".myday-title", has_text="Keep an eye on this").wait_for()
    pinned.locator(".myday-task", has_text="Keep an eye on this").locator(".myday-pin").click()
    pinned.wait_for(state="detached")
    wait_for(lambda: tid not in api.get("/api/v1/pins/"))

    # and with the keyboard: j, p
    open_list(page, project)
    page.locator("body").click(position={"x": 5, "y": 5})
    page.keyboard.press("j")
    page.keyboard.press("p")
    wait_for(lambda: tid in api.get("/api/v1/pins/"))
