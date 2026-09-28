"""Browser tests: the real app (backend + production build) in Chromium.

Needs a frontend build (cd frontend && npm run build, or PM_E2E_BUILD=path)
and PostgreSQL: PM_TEST_DATABASE_URL like the backend tests, or a throwaway
server via `pgserver` when it isn't set. PW_CHANNEL=chrome uses an installed
Chrome instead of Playwright's Chromium.

Each test makes its own project and tasks (unique names) and looks only at
those, so tests don't depend on each other or on their order.
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import urlparse

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
PASSWORD = "e2e-password-1"


def _database_server():
    url = os.environ.get("PM_TEST_DATABASE_URL")
    if url:
        return url, None
    import pgserver

    srv = pgserver.get_server(tempfile.mkdtemp(prefix="pm-e2e-pg-"), cleanup_mode="delete")
    # pgserver's libpq for psycopg, and its tools on PATH
    os.environ["PATH"] = str(Path(pgserver.__file__).parent / "pginstall" / "bin") + os.pathsep + os.environ["PATH"]
    return srv.get_uri(), srv


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Api:
    """The REST API as a user, for setting things up and checking results."""

    def __init__(self, base, token=None):
        self.base, self.token = base, token

    def call(self, method, path, body=None, form=None):
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        data = None
        if form is not None:
            from urllib.parse import urlencode
            data = urlencode(form).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        elif body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req) as r:
                return json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            raise AssertionError(f"{method} {path}: {e.code} {e.read().decode()}") from None

    def get(self, path):
        return self.call("GET", path)

    def post(self, path, **body):
        return self.call("POST", path, body)

    def put(self, path, **body):
        return self.call("PUT", path, body)

    # shortcuts
    def project(self, name=None, **kw):
        return self.post("/api/v1/projects/", name=name or f"P-{uuid.uuid4().hex[:6]}", **kw)

    def task(self, title, **kw):
        return self.post("/api/v1/tasks/", title=title, **kw)

    def tasks(self):
        return self.get("/api/v1/tasks/")

    def find(self, title):
        found = [t for t in self.tasks() if t["title"] == title]
        return found[0] if len(found) == 1 else found


@pytest.fixture(scope="session")
def server():
    url, pg = _database_server()
    u = urlparse(url)
    name = f"pm_e2e_{uuid.uuid4().hex[:8]}"
    env = {
        **os.environ,
        "DB_HOST": u.hostname or "localhost", "DB_PORT": str(u.port or 5432),
        "DB_USER": u.username or "postgres", "DB_PASSWORD": u.password or "", "DB_NAME": name,
        "SECRET_KEY": "e2e-secret-key-of-at-least-32-bytes-for-hs256",
        "PM_BACKUP_DIR": tempfile.mkdtemp(prefix="pm-e2e-backups-"),
    }
    admin_url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    from sqlalchemy import create_engine, text

    eng = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with eng.connect() as c:
        c.execute(text(f'CREATE DATABASE "{name}"'))
    subprocess.run([sys.executable, "migrate.py"], cwd=BACKEND, env=env, check=True, capture_output=True)

    port = _free_port()
    log = open(ARTIFACTS.parent / "server.log", "w")
    proc = subprocess.Popen([sys.executable, str(ROOT / "e2e" / "serve.py"), str(port)], env=env,
                            stdout=log, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try:
            urllib.request.urlopen(base + "/api/health")
            break
        except Exception:
            if proc.poll() is not None:
                raise RuntimeError("server didn't start, see e2e/server.log")
            time.sleep(0.2)
    else:
        raise RuntimeError("server didn't answer, see e2e/server.log")
    yield base
    proc.terminate()
    proc.wait(10)
    log.close()
    with eng.connect() as c:
        c.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
    eng.dispose()
    shutil.rmtree(env["PM_BACKUP_DIR"], ignore_errors=True)
    if pg is not None:
        pg.cleanup()


def _login(base, username):
    return Api(base).call("POST", "/api/auth/login", form={"username": username, "password": PASSWORD})["access_token"]


@pytest.fixture(scope="session")
def users(server):
    """admin (the first account) and anna, a normal user."""
    Api(server).post("/api/auth/register", username="admin", email="admin@example.com", password=PASSWORD)
    admin = Api(server, _login(server, "admin"))
    admin.post("/api/users/", username="anna", email="anna@example.com", password=PASSWORD)
    anna = Api(server, _login(server, "anna"))
    admin.me = admin.get("/api/auth/me")
    anna.me = anna.get("/api/auth/me")
    return {"admin": admin, "anna": anna}


@pytest.fixture
def api(users):
    return users["admin"]


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch(channel=os.environ.get("PW_CHANNEL") or None)
        yield b
        b.close()


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    setattr(item, f"rep_{rep.when}", rep)


def _context(browser, server, request, token=None, phone=False):
    opts = dict(locale="en-US", viewport={"width": 1280, "height": 900})
    if phone:
        opts = dict(locale="en-US", viewport={"width": 390, "height": 844}, device_scale_factor=2,
                    is_mobile=True, has_touch=True)
    ctx = browser.new_context(base_url=server, **opts)
    ctx.grant_permissions(["clipboard-read", "clipboard-write"])
    if token:
        ctx.add_init_script(f"localStorage.setItem('token', {token!r});")
    ctx.set_default_timeout(10000)
    return ctx


@pytest.fixture
def make_page(browser, server, users, request):
    """make_page(user='admin', phone=False, logged_in=True) -> page. Fails the
    test on JavaScript errors; saves a screenshot when the test fails."""
    made = []

    def make(user="admin", phone=False, logged_in=True):
        ctx = _context(browser, server, request, users[user].token if logged_in else None, phone)
        errors = []
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        made.append((ctx, page, errors))
        return page

    yield make
    failed = getattr(request.node, "rep_call", None) is not None and request.node.rep_call.failed
    for i, (ctx, page, errors) in enumerate(made):
        if failed:
            ARTIFACTS.mkdir(exist_ok=True)
            try:
                page.screenshot(path=str(ARTIFACTS / f"{request.node.name}-{i}.png"), full_page=True)
            except Exception:
                pass
        ctx.close()
        assert not errors, f"JavaScript errors: {errors}"


@pytest.fixture
def page(make_page):
    return make_page()


def wait_for(check, timeout=5.0):
    """Polls check() (e.g. an API call) until it's truthy; returns its value."""
    end = time.time() + timeout
    while True:
        value = check()
        if value or time.time() > end:
            assert value, "condition not reached"
            return value
        time.sleep(0.2)


def open_list(page, project):
    """The Tasks page filtered to one project, loaded."""
    page.goto(f"/?project={project['id']}")
    page.wait_for_selector(".task-list")
    return page


def row(page, title):
    """A task row's header (checkbox, title, badges, buttons)."""
    return page.locator(".task-item", has_text=title).first.locator(":scope > .task-header")
