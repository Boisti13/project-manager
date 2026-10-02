"""Workspaces: the user's own groups of projects, one shown at a time."""
from conftest import row, wait_for


def test_workspaces_show_one_area_at_a_time(page, api):
    office = api.project(name="Office WS")
    garden = api.project(name="Garden WS")
    api.task("Write the WS report", project_id=office["id"])
    api.task("Fix the WS fence", project_id=garden["id"])
    page.on("dialog", lambda d: d.accept())
    try:
        # create two in Settings; the switch appears in the top bar
        page.goto("/settings")
        assert page.locator(".workspace-switcher").count() == 0
        for name in ("Job", "Home"):
            page.locator("#new-workspace").fill(name)
            page.locator("#new-workspace").press("Enter")
            page.locator(".workspace-chip", has_text=name).wait_for()
        switcher = page.locator(".workspace-switcher")
        switcher.wait_for()
        ws = {w["name"]: w for w in api.get("/api/v1/workspaces/")["workspaces"]}

        # file the office project through the project form, the garden one by API
        page.goto("/projects")
        page.locator(".project-item", has_text="Office WS").locator(".edit-btn").first.click()
        page.locator(".form-group", has_text="Workspace").locator("select").select_option(label="Job")
        page.get_by_role("button", name="Save").click()
        page.locator(".project-item", has_text="Office WS").locator(".workspace-badge", has_text="Job").wait_for()
        api.put(f"/api/v1/workspaces/projects/{garden['id']}", workspace_id=ws["Home"]["id"])

        # Job: only its project (and unfiled ones) in the list, on Projects, in the form
        switcher.select_option(label="Job")
        page.goto("/")
        row(page, "Write the WS report").wait_for()
        assert page.locator(".task-item", has_text="Fix the WS fence").count() == 0
        page.goto("/projects")
        page.locator(".project-item", has_text="Office WS").wait_for()
        assert page.locator(".project-item", has_text="Garden WS").count() == 0

        # the choice is kept on reload; W switches to the next (Home)
        page.goto("/")
        assert page.locator(".workspace-switcher").input_value() == str(ws["Job"]["id"])
        page.locator("body").click(position={"x": 5, "y": 5})
        page.keyboard.press("w")
        row(page, "Fix the WS fence").wait_for()
        assert page.locator(".task-item", has_text="Write the WS report").count() == 0

        # unfiled projects: everywhere by default, only under "All" when set so
        loose = api.project(name="Loose WS")
        api.task("Loose WS task", project_id=loose["id"])
        page.reload()
        row(page, "Loose WS task").wait_for()
        page.goto("/settings")
        page.get_by_label("show only under “All workspaces”").check()
        wait_for(lambda: api.get("/api/v1/workspaces/")["unassigned_everywhere"] is False)
        page.goto("/")
        row(page, "Fix the WS fence").wait_for()
        assert page.locator(".task-item", has_text="Loose WS task").count() == 0

        # All shows everything again
        page.locator(".workspace-switcher").select_option(label="All workspaces")
        row(page, "Loose WS task").wait_for()
        row(page, "Write the WS report").wait_for()
    finally:
        api.put("/api/v1/workspaces/settings", unassigned_everywhere=True)
        for w in api.get("/api/v1/workspaces/")["workspaces"]:
            api.call("DELETE", f"/api/v1/workspaces/{w['id']}")
