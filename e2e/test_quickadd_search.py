"""Quick add on My day, and the search window (Ctrl+K)."""
from conftest import row, wait_for


def test_quick_add_on_my_day(page, api):
    project = api.project(name="QuickAdd P")
    label = api.post("/api/v1/labels/", name="qa-label", color="#795548")
    page.goto("/today")
    box = page.get_by_label("Add a task")
    box.wait_for()  # once My day has loaded
    page.locator("body").click(position={"x": 5, "y": 5})
    page.keyboard.press("n")  # jumps to the field
    assert page.evaluate("document.activeElement.getAttribute('aria-label')") == "Add a task"

    page.locator(".quick-add select").select_option(label="QuickAdd P")
    box.fill("Call the QA supplier today !high #qa-label")
    page.locator(".quick-add .quick-chip").nth(2).wait_for()
    box.press("Enter")
    page.locator(".quick-add-done", has_text="Call the QA supplier").wait_for()
    assert box.input_value() == ""

    task = wait_for(lambda: next((t for t in api.tasks() if t["title"] == "Call the QA supplier"), None))
    assert (task["project_id"], task["priority"], task["label_ids"]) == (project["id"], 2, [label["id"]])
    assert task["assignee_id"] == api.me["id"] and task["deadline"]
    # due today: it shows up on My day right away
    page.locator(".myday-section", has_text="Due today").get_by_text("Call the QA supplier").wait_for()
    # the project stays chosen for the next one
    page.reload()
    assert page.locator(".quick-add select option:checked").inner_text() == "QuickAdd P"


def test_search_window(page, api):
    project = api.project(name="Searchable Lab")
    parent = api.task("Calibrate the spectrometer", project_id=project["id"])
    api.task("Order the calibration kit", parent_task_id=parent["id"])
    other = api.task("Unrelated thing", project_id=project["id"])
    api.post(f"/api/v1/tasks/{other['id']}/comments", body="the zebrafish arrived")

    page.goto("/projects")
    page.locator(".container h1").wait_for()
    page.keyboard.press("Control+k")
    dialog = page.get_by_role("dialog", name="Search")
    dialog.get_by_role("combobox").fill("calib")
    options = dialog.get_by_role("option")
    options.nth(1).wait_for()
    assert "Calibrate the spectrometer" in options.nth(0).inner_text()
    assert "Searchable Lab" in options.nth(1).inner_text()  # the subtask's project is its parent's
    # arrow down + Enter opens the second one in the list
    page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    page.wait_for_url("**/?task=*")
    row(page, "Order the calibration kit").wait_for()
    assert page.get_by_role("dialog", name="Search").count() == 0

    # comments are searched too; projects show up as well; Esc closes
    page.locator(".search-btn").click()
    dialog.get_by_role("combobox").fill("zebrafish")
    dialog.get_by_role("option", name="Unrelated thing").wait_for()
    assert "in a comment" in dialog.get_by_role("option").first.inner_text()
    dialog.get_by_role("combobox").fill("searchable lab")
    dialog.get_by_role("option").filter(has_text="Project").first.wait_for()
    page.keyboard.press("Escape")
    assert page.get_by_role("dialog", name="Search").count() == 0
