"""Formatted descriptions and comments, archiving projects, read-only share links."""
from conftest import open_list, row, wait_for


def test_descriptions_and_comments_are_formatted(page, api):
    project = api.project()
    task = api.task("Order parts", project_id=project["id"],
                    description="**40** units, see [the quote](https://example.com/q) or https://x.org/y.\n"
                                "- cables\n- antennas\n[bad](javascript:alert(1))")
    api.post(f"/api/v1/tasks/{task['id']}/comments", body="Done:\n- [x] quote\n- [ ] order")
    open_list(page, project)

    desc = page.locator(".task-item", has_text="Order parts").first.locator(".task-description")
    assert desc.locator("strong").inner_text() == "40"
    links = desc.locator("a")
    assert [links.nth(i).get_attribute("href") for i in range(links.count())] == ["https://example.com/q", "https://x.org/y"]
    assert links.first.get_attribute("target") == "_blank"
    assert desc.locator("li").all_inner_texts() == ["cables", "antennas"]
    assert "[bad](javascript:alert(1))" in desc.inner_text()  # not a link

    row(page, "Order parts").locator(".comment-btn").click()
    body = page.locator(".comment-body").first
    body.wait_for()
    assert body.locator("li.md-check.done").count() == 1 and body.locator("li.md-check").count() == 2


def test_archive_a_project_and_restore_it(page, api):
    project = api.project()
    api.task("Leftover task", project_id=project["id"])
    page.on("dialog", lambda d: d.accept())
    page.goto("/projects")
    item = page.locator(".project-item", has_text=project["name"])
    item.locator(".archive-btn").click()
    page.locator(".success-message", has_text="is archived").wait_for()
    assert page.locator(".project-item", has_text=project["name"]).count() == 0
    assert api.get(f"/api/v1/projects/{project['id']}")["archived_at"]

    page.goto("/")
    page.wait_for_selector(".task-list")
    assert page.locator(".task-item", has_text="Leftover task").count() == 0  # hidden in the list
    page.locator("input[type=search]").fill("Leftover")
    row(page, "Leftover task").wait_for()  # search still finds it
    open_list(page, project)
    row(page, "Leftover task").wait_for()  # and so does its project filter

    page.goto("/projects")
    page.locator(".archived-projects .completed-toggle").click()
    page.locator(".archived-item", has_text=project["name"]).get_by_role("button", name="Restore").click()
    page.locator(".project-item", has_text=project["name"]).wait_for()
    assert api.get(f"/api/v1/projects/{project['id']}")["archived_at"] is None


def test_share_link_works_without_login_until_stopped(make_page, api):
    project = api.project(description="For our partners")
    cat = api.project(name="Ordering", parent_id=project["id"])
    task = api.task("Order antennas", project_id=cat["id"], description="**40** units")
    api.task("Get quote", parent_task_id=task["id"], status="done")
    api.post(f"/api/v1/tasks/{task['id']}/comments", body="internal remark")

    page = make_page()
    page.on("dialog", lambda d: d.accept())
    page.goto("/projects")
    item = page.locator(".project-item", has_text=project["name"])
    item.locator(".share-btn").click()
    item.get_by_role("button", name="Create link").click()
    url = item.locator(".project-share-link code").inner_text()
    assert "/share/" in url

    visitor = make_page(logged_in=False)
    visitor.goto(url)
    visitor.locator(".shared-head", has_text=project["name"]).wait_for()
    assert visitor.locator(".app-nav").count() == 0  # not logged in
    text = visitor.locator(".container").inner_text()
    assert "Order antennas" in text and "Get quote" in text and "ORDERING" in text.upper()
    assert "internal remark" not in text
    assert visitor.locator(".shared-description strong").inner_text() == "40"
    assert "1 of 2 tasks done" in text

    item.get_by_role("button", name="Stop sharing").click()
    wait_for(lambda: api.get(f"/api/v1/projects/{project['id']}")["share_token"] is None)
    visitor.reload()
    visitor.locator(".error-message", has_text="doesn’t work").wait_for()
