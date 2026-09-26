import os

import pytest


def put(backup_dir, name, content=b"PGDMP" + b"x" * 100):
    (backup_dir / name).write_bytes(content)
    return name


def test_health(client):
    r = client.get("/api/health").json()
    assert r["status"] == "ok" and r["version"]


def test_backups_admin_only(client, admin, alice, backup_dir):
    put(backup_dir, "projectmanager-1-a.dump")
    for method, path in [("get", "/api/system/backups"), ("post", "/api/system/backups"),
                         ("get", "/api/system/backups/projectmanager-1-a.dump"),
                         ("delete", "/api/system/backups/projectmanager-1-a.dump"),
                         ("post", "/api/system/backups/projectmanager-1-a.dump/restore")]:
        assert getattr(client, method)(path, headers=alice.headers).status_code == 403, path


def test_list_download_delete(client, admin, backup_dir):
    a = put(backup_dir, "projectmanager-1-a.dump", b"PGDMP-A")
    put(backup_dir, "notes.txt", b"no")
    listed = client.get("/api/system/backups", headers=admin.headers).json()
    assert [b["name"] for b in listed["backups"]] == [a]
    r = client.get(f"/api/system/backups/{a}", headers=admin.headers)
    assert r.status_code == 200 and r.content == b"PGDMP-A"
    assert client.delete(f"/api/system/backups/{a}", headers=admin.headers).json() == {"ok": True}
    assert not (backup_dir / a).exists()


@pytest.mark.parametrize("name", ["notes.txt", "missing.dump", "..%2F..%2Fetc%2Fpasswd", "a b.dump"])
def test_bad_backup_names(client, admin, backup_dir, name):
    put(backup_dir, "notes.txt", b"no")
    assert client.get(f"/api/system/backups/{name}", headers=admin.headers).status_code == 404
    assert client.delete(f"/api/system/backups/{name}", headers=admin.headers).status_code == 404
    assert (backup_dir / "notes.txt").exists()


def test_upload(client, admin, backup_dir):
    bad = client.post("/api/system/backups/upload", files={"file": ("x.dump", b"hello")}, headers=admin.headers)
    assert bad.status_code == 400
    ok = client.post("/api/system/backups/upload", files={"file": ("x.dump", b"PGDMP" + b"1" * 50)}, headers=admin.headers)
    assert ok.status_code == 200
    name = ok.json()["name"]
    assert name.endswith("-uploaded.dump") and (backup_dir / name).read_bytes().startswith(b"PGDMP")


@pytest.mark.skipif(os.name == "posix", reason="covered by the script tests on Linux")
def test_restore_refused_off_linux(client, admin, backup_dir):
    put(backup_dir, "projectmanager-1-a.dump")
    r = client.post("/api/system/backups/projectmanager-1-a.dump/restore", headers=admin.headers)
    assert r.status_code == 400


def test_system_info(client, alice):
    r = client.get("/api/system/info", headers=alice.headers).json()
    assert r["version"] and "is_git" in r


def test_update_check_rejects_bad_branch_names(client, alice):
    for bad in ["--upload-pack=x", "../etc", "a..b", ""]:
        assert client.get("/api/system/check", params={"branch": bad}, headers=alice.headers).status_code in (400, 422)


@pytest.mark.skipif(os.name != "posix", reason="flock is Linux-only")
def test_second_update_is_refused_while_one_runs(client, admin):
    """scripts/update.sh holds .update/update.lock; both the endpoint and a
    second run of the script back off while it's held."""
    import fcntl
    import shutil
    import subprocess

    from app.routers import system

    system.STATE_DIR.mkdir(exist_ok=True)
    status_before = system.STATUS_FILE.read_text() if system.STATUS_FILE.exists() else None
    with open(system.LOCK_FILE, "a") as held:
        fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # A bogus branch: if the lock check were missing this fails validation
        # (404) instead of starting a real update.
        r = client.post("/api/system/update", json={"branch": "no-such-branch-xyz"}, headers=admin.headers)
        assert r.status_code == 409
        if shutil.which("flock"):
            p = subprocess.run(["bash", str(system.UPDATE_SCRIPT), "no-such-branch-xyz"],
                               capture_output=True, text=True)
            assert p.returncode == 75 and "already running" in p.stderr
            now = system.STATUS_FILE.read_text() if system.STATUS_FILE.exists() else None
            assert now == status_before  # the running update's status is untouched
    assert system._update_locked() is False


def test_update_is_admin_only(client, admin, alice):
    assert client.post("/api/system/update", json={"branch": "main"}, headers=alice.headers).status_code == 403
    assert client.get("/api/system/update/status", headers=alice.headers).status_code == 403
