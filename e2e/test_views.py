"""Board, calendar, reordering, and jumping to a task from a link."""
import datetime

from conftest import open_list, row, wait_for


def test_board_moves_cards_and_opens_them_in_the_list(page, api):
    project = api.project()
    api.task("Card", project_id=project["id"])
    page.goto(f"/?project={project['id']}&view=board")
    card = page.locator(".board-card", has_text="Card")

    card.get_by_role("button", name="Move to In Progress").click()
    wait_for(lambda: api.find("Card")["status"] == "in_progress")
    page.locator(".board-column.status-in_progress .board-card", has_text="Card").wait_for()
    page.locator(".board-card", has_text="Card").get_by_role("button", name="Move to Blocked").click()
    wait_for(lambda: api.find("Card")["status"] == "blocked")
    page.locator(".board-column.status-blocked .board-card", has_text="Card").get_by_role("button", name="Move to Done").click()
    page.locator(".undo-toast", has_text="Marked “Card” done").wait_for()
    wait_for(lambda: api.find("Card")["status"] == "done")
    page.locator(".undo-btn").click()
    wait_for(lambda: api.find("Card")["status"] == "blocked")

    page.locator(".board-card", has_text="Card").locator(".board-card-title").click()
    row(page, "Card").wait_for()  # the list, with the task in view
    assert "view=board" not in page.url


def test_move_up_and_drag_to_reorder(page, api):
    project = api.project()
    for title in ("A", "B", "C"):
        api.task(title, project_id=project["id"])
    open_list(page, project)

    def order():
        return [t["title"] for t in sorted((t for t in api.tasks() if t["project_id"] == project["id"]),
                                           key=lambda t: (t["order"], t["id"]))]

    row(page, "C").locator(".menu-btn").click()
    page.get_by_role("menuitem", name="Move up").click()
    wait_for(lambda: order() == ["A", "C", "B"])

    page.locator(".task-item", has_text="B").first.drag_to(page.locator(".task-item", has_text="A").first)
    wait_for(lambda: order() == ["B", "A", "C"])
    page.wait_for_function(
        "() => [...document.querySelectorAll('.task-list .task-title')].map(e => e.textContent).join() === 'B,A,C'"
    )


def test_link_to_a_subtask_opens_the_way_to_it(page, api):
    project = api.project()
    parent = api.task("Parent task", project_id=project["id"])
    child = api.task("Hidden child", parent_task_id=parent["id"])
    page.goto(f"/?task={child['id']}")
    row(page, "Hidden child").wait_for()  # parent expanded on the way
    page.wait_for_function("() => !location.search.includes('task=')")


def test_calendar_shows_deadlines_and_takes_a_drop_on_another_day(page, api):
    project = api.project()
    today = datetime.date.today()
    api.task("Due soon", project_id=project["id"], deadline=today.isoformat() + "T00:00:00")
    page.goto(f"/?project={project['id']}&view=calendar")
    chip = page.locator(".cal-chip", has_text="Due soon")
    chip.wait_for()

    def cell(day):
        return page.locator(f'.cal-day[aria-label^="{day.month}/{day.day}/{day.year}:"]')

    target = today + datetime.timedelta(days=1)
    if cell(target).count() == 0:  # today is the grid's last day
        target = today - datetime.timedelta(days=1)
    chip.drag_to(cell(target))
    wait_for(lambda: api.find("Due soon")["deadline"].startswith(target.isoformat()))
    cell(target).locator(".cal-chip", has_text="Due soon").wait_for()


def test_timeline_shows_bars_and_moves_them_by_dragging(page, api):
    project = api.project()
    first = api.task("Plan the stand", project_id=project["id"], start_date="2026-10-05T00:00:00",
                     deadline="2026-10-07T00:00:00")
    api.task("Build the stand", project_id=project["id"], start_date="2026-10-12T00:00:00",
             deadline="2026-10-14T00:00:00", blocked_by_ids=[first["id"]])
    api.task("Hand over", project_id=project["id"], deadline="2026-10-16T00:00:00")
    api.task("Someday", project_id=project["id"])
    page.goto(f"/?project={project['id']}&view=timeline")
    page.locator(".tl-bar").first.wait_for()
    assert page.locator(".tl-bar").count() == 2 and page.locator(".tl-milestone").count() == 1
    assert page.locator(".tl-links path:not(marker path)").count() == 1  # Build waits for Plan
    assert "One open task has no dates" in page.locator(".archive-note").last.inner_text()

    # Days zoom (34 px a day): drag "Plan" two days later
    page.get_by_role("button", name="Days").click()
    bar = page.locator("#tl-" + str(first["id"]) + " .tl-bar")
    box = bar.bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] / 2 + 34 * 2 + 3, box["y"] + box["height"] / 2, steps=8)
    page.mouse.up()
    wait_for(lambda: api.find("Plan the stand")["start_date"].startswith("2026-10-07"))
    assert api.find("Plan the stand")["deadline"].startswith("2026-10-09")
    page.locator(".undo-toast", has_text="Moved “Plan the stand”").wait_for()

    # drag the end one day later
    box = bar.bounding_box()
    handle_x = box["x"] + box["width"] - 3
    page.mouse.move(handle_x, box["y"] + box["height"] / 2)
    page.mouse.down()
    page.mouse.move(handle_x + 34 + 3, box["y"] + box["height"] / 2, steps=6)
    page.mouse.up()
    wait_for(lambda: api.find("Plan the stand")["deadline"].startswith("2026-10-10"))
    assert api.find("Plan the stand")["start_date"].startswith("2026-10-07")  # start stays

    # Undo puts the dates back
    page.locator(".undo-btn").click()
    wait_for(lambda: api.find("Plan the stand")["deadline"].startswith("2026-10-09"))

    # a click (no drag) opens the task in the list
    bar.click()
    row(page, "Plan the stand").wait_for()
