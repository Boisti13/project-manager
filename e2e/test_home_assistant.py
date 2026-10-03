"""Settings → Home Assistant: the REST snippet, the broker settings, the opt-in."""
from conftest import wait_for


def test_home_assistant_settings(page, api):
    page.goto("/settings")
    section = page.locator(".settings-section", has_text="Let Home Assistant fetch them")
    yaml = section.locator(".ha-yaml")
    assert "/api/v1/summary/" in yaml.inner_text() and "!secret project_manager_token" in yaml.inner_text()
    section.get_by_text("MQTT is off — set up the broker below.").wait_for()

    broker = section.locator(".ha-broker")
    try:
        broker.get_by_label("Broker address").fill("127.0.0.1")
        broker.get_by_label("Port", exact=True).fill("1")
        broker.get_by_label("Password").fill("pw")
        broker.get_by_role("button", name="Test connection").click()
        broker.locator(".error-message", has_text="Can’t connect").wait_for()

        broker.get_by_label("Send to Home Assistant over MQTT").check()
        broker.get_by_role("button", name="Save").click()
        broker.locator(".settings-ok", has_text="Saved.").wait_for()
        assert broker.get_by_label("Password").get_attribute("placeholder") == "(unchanged)"
        settings = api.get("/api/v1/home-assistant/mqtt")["settings"]
        assert settings["enabled"] and settings["host"] == "127.0.0.1" and settings["password_set"]
        broker.get_by_text("The reminder goes by the server’s clock").wait_for()

        # now everyone can opt in
        section.get_by_label("Send my notifications and task numbers to Home Assistant").check()
        wait_for(lambda: api.get("/api/v1/home-assistant/me")["enabled"])
        section.get_by_text("Project Manager (admin)").wait_for()
    finally:
        api.put("/api/v1/home-assistant/me", enabled=False)
        api.put("/api/v1/home-assistant/mqtt", enabled=False)
