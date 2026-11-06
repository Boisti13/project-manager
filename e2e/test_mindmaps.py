"""Mind maps: typing ideas with the keyboard, dragging, undo, ideas to tasks."""
from conftest import wait_for


def nodes(api, map_id):
    m = api.get(f"/api/v1/mindmaps/{map_id}")
    texts = {n["id"]: n["text"] for n in m["nodes"]}
    return [(n["text"], texts.get(n.get("parent"))) for n in m["nodes"]], m["nodes"]


def test_mind_map_keyboard_drag_undo_and_tasks(page, api):
    project = api.project()
    page.goto(f"/mindmaps?project={project['id']}")
    page.get_by_placeholder("Topic of the new mind map").fill("Summer party")
    page.locator(".mindmaps-new select").select_option(label=project["name"])
    page.get_by_role("button", name="+ Mind map").click()
    page.locator(".mm-root", has_text="Summer party").wait_for()
    map_id = int(page.url.rsplit("/", 1)[1])

    page.locator(".mindmap-canvas").focus()
    page.keyboard.press("Tab")
    page.keyboard.type("Food")
    page.keyboard.press("Tab")  # the next one goes below it
    page.keyboard.type("Pizza")
    page.keyboard.press("Enter")
    page.keyboard.press("Enter")  # one next to Pizza
    page.keyboard.type("Salad")
    page.keyboard.press("Enter")
    page.keyboard.press("Escape")
    page.keyboard.press("Tab")
    page.keyboard.type("Music")
    page.keyboard.press("Enter")
    page.keyboard.press("Tab")
    page.keyboard.press("Escape")  # a new idea left empty is dropped
    wait_for(lambda: nodes(api, map_id)[0] == [("Food", None), ("Pizza", "Food"), ("Salad", "Food"), ("Music", None)])

    salad = page.locator(".mm-node", has_text="Salad").bounding_box()
    music = page.locator(".mm-node", has_text="Music").bounding_box()
    page.mouse.move(salad["x"] + 10, salad["y"] + 8)
    page.mouse.down()
    page.mouse.move(salad["x"] + 40, salad["y"] + 30, steps=5)
    page.mouse.move(music["x"] + 15, music["y"] + 10, steps=10)
    page.mouse.up()
    wait_for(lambda: ("Salad", "Music") in nodes(api, map_id)[0])
    page.keyboard.press("Control+z")
    wait_for(lambda: ("Salad", "Food") in nodes(api, map_id)[0])

    page.locator(".mm-node", has_text="Food").click()
    page.get_by_role("button", name="… with 2 subtasks").click()
    page.locator(".mindmap-task-link", has_text="Food").wait_for()
    food = api.find("Food")
    assert food["project_id"] == project["id"]
    assert {t["title"] for t in api.tasks() if t.get("parent_task_id") == food["id"]} == {"Pizza", "Salad"}
    wait_for(lambda: all(n.get("task_uid") for n in nodes(api, map_id)[1] if n["text"] != "Music"))

    page.locator(".mindmap-task-link", has_text="Food").click()
    page.wait_for_url("**/?task=*")
