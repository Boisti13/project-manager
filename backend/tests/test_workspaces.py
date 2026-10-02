"""Workspaces: each user's own groups of projects."""
WS = "/api/v1/workspaces/"


def post(client, user, url, **data):
    r = client.post(url, json=data, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def put(client, user, url, **data):
    return client.put(url, json=data, headers=user.headers)


def listing(client, user):
    r = client.get(WS, headers=user.headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_create_rename_reorder_delete(client, alice):
    assert listing(client, alice) == {"workspaces": [], "unassigned_everywhere": True}
    work = post(client, alice, WS, name="  Work   stuff ")
    home = post(client, alice, WS, name="Home", color="#123abc")
    assert work["name"] == "Work stuff" and work["position"] == 0 and work["color"]  # a palette color
    assert home["position"] == 1 and home["color"] == "#123abc"

    # names are unique per user, colors are hex
    assert client.post(WS, json={"name": "Home"}, headers=alice.headers).status_code == 400
    assert client.post(WS, json={"name": "X", "color": "red"}, headers=alice.headers).status_code == 422
    assert put(client, alice, f"{WS}{work['id']}", name="Home").status_code == 400
    r = put(client, alice, f"{WS}{work['id']}", name="Office", color="#00ff00")
    assert r.status_code == 200 and r.json()["name"] == "Office" and r.json()["color"] == "#00ff00"

    assert put(client, alice, f"{WS}order", ids=[home["id"], work["id"]]).status_code == 200
    assert [w["name"] for w in listing(client, alice)["workspaces"]] == ["Home", "Office"]
    assert put(client, alice, f"{WS}order", ids=[home["id"]]).status_code == 400  # must list all

    assert client.delete(f"{WS}{home['id']}", headers=alice.headers).status_code == 200
    assert [w["name"] for w in listing(client, alice)["workspaces"]] == ["Office"]


def test_projects_in_workspaces_are_personal(client, alice, bob):
    work = post(client, alice, WS, name="Work")
    home = post(client, alice, WS, name="Private")
    bobs = post(client, bob, WS, name="Work")
    shared = post(client, alice, "/api/v1/projects/", name="Shared")
    garden = post(client, alice, "/api/v1/projects/", name="Garden")
    category = post(client, alice, "/api/v1/projects/", name="Cat", parent_id=shared["id"])

    assert put(client, alice, f"{WS}projects/{shared['id']}", workspace_id=work["id"]).status_code == 200
    assert put(client, alice, f"{WS}projects/{garden['id']}", workspace_id=home["id"]).status_code == 200
    assert put(client, bob, f"{WS}projects/{shared['id']}", workspace_id=bobs["id"]).status_code == 200
    mine = {w["name"]: w["project_ids"] for w in listing(client, alice)["workspaces"]}
    assert mine == {"Work": [shared["id"]], "Private": [garden["id"]]}
    assert listing(client, bob)["workspaces"][0]["project_ids"] == [shared["id"]]

    # moving, and taking out again
    assert put(client, alice, f"{WS}projects/{shared['id']}", workspace_id=home["id"]).status_code == 200
    assert put(client, alice, f"{WS}projects/{garden['id']}", workspace_id=None).status_code == 200
    mine = {w["name"]: w["project_ids"] for w in listing(client, alice)["workspaces"]}
    assert mine == {"Work": [], "Private": [shared["id"]]}

    # categories follow their project; someone else's workspace isn't yours
    assert put(client, alice, f"{WS}projects/{category['id']}", workspace_id=work["id"]).status_code == 400
    assert put(client, alice, f"{WS}projects/{garden['id']}", workspace_id=bobs["id"]).status_code == 404
    assert put(client, bob, f"{WS}{work['id']}", name="Mine").status_code == 404
    assert client.delete(f"{WS}{work['id']}", headers=bob.headers).status_code == 404

    # deleting a workspace leaves its projects (in no workspace)
    assert client.delete(f"{WS}{home['id']}", headers=alice.headers).status_code == 200
    assert client.get(f"/api/v1/projects/{shared['id']}", headers=alice.headers).status_code == 200
    assert listing(client, alice)["workspaces"][0]["project_ids"] == []
    # deleting a project removes it from workspaces
    assert put(client, alice, f"{WS}projects/{garden['id']}", workspace_id=work["id"]).status_code == 200
    assert client.delete(f"/api/v1/projects/{garden['id']}", headers=alice.headers).status_code == 200
    assert listing(client, alice)["workspaces"][0]["project_ids"] == []


def test_private_projects_and_settings(client, alice, bob):
    secret = post(client, alice, "/api/v1/projects/", name="Secret", is_private=True)
    ws = post(client, bob, WS, name="Work")
    # bob can't see it, so he can't file it
    assert put(client, bob, f"{WS}projects/{secret['id']}", workspace_id=ws["id"]).status_code == 404
    # filed, then no longer visible: not listed
    alices = post(client, alice, WS, name="Mine")
    assert put(client, alice, f"{WS}projects/{secret['id']}", workspace_id=alices["id"]).status_code == 200
    assert listing(client, alice)["workspaces"][0]["project_ids"] == [secret["id"]]

    assert put(client, alice, f"{WS}settings", unassigned_everywhere=False).status_code == 200
    assert listing(client, alice)["unassigned_everywhere"] is False
    assert listing(client, bob)["unassigned_everywhere"] is True


def test_limit(client, alice):
    for i in range(20):
        post(client, alice, WS, name=f"W{i}")
    assert client.post(WS, json={"name": "One more"}, headers=alice.headers).status_code == 400
