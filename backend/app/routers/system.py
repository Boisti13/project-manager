"""Version info, update checks, and in-app updates.

Checking is open to any logged-in user; applying an update is admin-only.
The update itself runs in scripts/update.sh as a detached process, because
it ends by restarting this backend via supervisor.
"""
import os
import re
import subprocess
import threading
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_current_admin_user
from app.database import engine, get_db
from app.models import User

router = APIRouter()

APP_DIR = Path(__file__).resolve().parents[3]
UPDATE_SCRIPT = APP_DIR / "scripts" / "update.sh"
STATE_DIR = APP_DIR / ".update"
STATUS_FILE = STATE_DIR / "status"
LOG_FILE = STATE_DIR / "update.log"
STALE_AFTER = 30 * 60  # seconds
BACKUP_SCRIPT = APP_DIR / "scripts" / "backup-db.sh"
BACKUP_DIR = Path(os.environ.get("PM_BACKUP_DIR", "/var/backups/project-manager"))

BRANCH_RE = re.compile(r"^[A-Za-z0-9._][A-Za-z0-9._/-]{0,99}$")

# Serialises git calls within this process so concurrent "check" clicks
# don't trip over .git/index.lock.
_git_lock = threading.Lock()


def _git(*args, timeout=30):
    """Runs git in APP_DIR with a fixed argument list (no shell). Branch names
    are validated against BRANCH_RE and the remote's branch list first."""
    with _git_lock:
        try:
            r = subprocess.run(
                ["git", *args], cwd=APP_DIR, capture_output=True, text=True, timeout=timeout
            )
        except (subprocess.SubprocessError, OSError) as e:
            return False, str(e)
    return r.returncode == 0, (r.stdout or "") + (r.stderr or "")


def _is_git_checkout():
    return (APP_DIR / ".git").exists()


def _read_version(ref=None):
    if ref is None:
        try:
            return (APP_DIR / "VERSION").read_text().strip()
        except OSError:
            return None
    ok, out = _git("show", f"{ref}:VERSION")
    return out.strip() if ok else None


def _require_git():
    if not _is_git_checkout():
        raise HTTPException(status_code=400, detail="Not a git checkout — updates are unavailable.")


def _remote_branches():
    ok, out = _git("ls-remote", "--heads", "origin", timeout=20)
    if not ok:
        raise HTTPException(status_code=502, detail="Could not reach the git remote: " + out[-300:])
    prefix = "refs/heads/"
    refs = (line.split("\t", 1)[1] for line in out.splitlines() if "\t" in line)
    return sorted(ref[len(prefix):] for ref in refs if ref.startswith(prefix))


def _validate_branch(branch):
    if not BRANCH_RE.match(branch) or ".." in branch:
        raise HTTPException(status_code=400, detail="Invalid branch name")
    if branch not in _remote_branches():
        raise HTTPException(status_code=404, detail=f"Branch '{branch}' does not exist on the remote")


def _update_state():
    try:
        state = STATUS_FILE.read_text().strip()
        # A run that was killed (e.g. container reboot) never writes a final
        # state; don't let it block updates forever.
        if state in ("running", "restarting") and time.time() - STATUS_FILE.stat().st_mtime > STALE_AFTER:
            state = "failed"
    except OSError:
        state = "idle"
    try:
        log = LOG_FILE.read_text(errors="replace")[-8000:]
    except OSError:
        log = ""
    return state, log


@router.get("/info")
def info(current_user: User = Depends(get_current_user)):
    data = {"version": _read_version(), "is_git": _is_git_checkout(),
            "branch": None, "commit": None, "message": None}
    if data["is_git"]:
        ok, branch = _git("rev-parse", "--abbrev-ref", "HEAD")
        if ok:
            _, commit = _git("rev-parse", "--short", "HEAD")
            _, message = _git("log", "-1", "--pretty=%s")
            data.update(branch=branch.strip(), commit=commit.strip(), message=message.strip())
    return data


@router.get("/branches")
def branches(current_user: User = Depends(get_current_user)):
    _require_git()
    return _remote_branches()


@router.get("/check")
def check(branch: str, current_user: User = Depends(get_current_user)):
    _require_git()
    _validate_branch(branch)
    ok, out = _git("fetch", "--quiet", "origin",
                   f"+refs/heads/{branch}:refs/remotes/origin/{branch}", timeout=60)
    if not ok:
        raise HTTPException(status_code=502, detail="Fetch failed: " + out[-300:])

    remote = f"origin/{branch}"
    _, head = _git("rev-parse", "HEAD")
    _, target = _git("rev-parse", remote)
    _, current_branch = _git("rev-parse", "--abbrev-ref", "HEAD")
    _, counts = _git("rev-list", "--left-right", "--count", f"HEAD...{remote}")
    ahead, behind = (int(x) for x in counts.split()) if len(counts.split()) == 2 else (0, 0)
    _, log = _git("log", "--pretty=%h\t%s", "-20", f"HEAD..{remote}")
    commits = [dict(zip(("commit", "message"), line.split("\t", 1)))
               for line in log.splitlines() if "\t" in line]

    return {
        "branch": branch,
        "current_branch": current_branch.strip(),
        "current_version": _read_version(),
        "target_version": _read_version(remote),
        "target_commit": target.strip()[:7],
        "behind": behind,
        "ahead": ahead,
        "commits": commits,
        # A different branch is always switchable, even at the same commit.
        "update_available": head.strip() != target.strip() or current_branch.strip() != branch,
    }


class UpdateRequest(BaseModel):
    branch: str


@router.post("/update", status_code=202)
def start_update(req: UpdateRequest, current_user: User = Depends(get_current_admin_user)):
    _require_git()
    if os.name != "posix":
        raise HTTPException(status_code=400, detail="In-app updates only work on the Linux deployment.")
    state, _ = _update_state()
    if state in ("running", "restarting"):
        raise HTTPException(status_code=409, detail="An update is already in progress.")
    _validate_branch(req.branch)

    STATE_DIR.mkdir(exist_ok=True)
    STATUS_FILE.write_text("running\n")
    LOG_FILE.write_text(f"Update to '{req.branch}' requested by {current_user.username}\n")
    # New session so supervisor restarting the backend doesn't take the
    # script down with it.
    subprocess.Popen(
        ["bash", str(UPDATE_SCRIPT), req.branch],
        cwd=APP_DIR,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    return {"status": "running"}


@router.get("/update/status")
def update_status(current_user: User = Depends(get_current_admin_user)):
    state, log = _update_state()
    return {"state": state, "log": log}


@router.get("/backups")
def list_backups(current_user: User = Depends(get_current_admin_user)):
    """Database dumps made by scripts/backup-db.sh, newest first."""
    try:
        files = sorted(BACKUP_DIR.glob("*.dump"), key=lambda p: p.stat().st_mtime, reverse=True)
    except OSError:
        files = []
    return {
        "dir": str(BACKUP_DIR),
        "backups": [
            {"name": f.name, "size": f.stat().st_size, "created": int(f.stat().st_mtime)}
            for f in files
        ],
    }


@router.post("/backups")
def create_backup(current_user: User = Depends(get_current_admin_user)):
    if os.name != "posix":
        raise HTTPException(status_code=400, detail="Backups only work on the Linux deployment.")
    try:
        r = subprocess.run(
            ["bash", str(BACKUP_SCRIPT), f"manual-{current_user.username}"],
            cwd=APP_DIR, capture_output=True, text=True, timeout=300,
        )
    except (subprocess.SubprocessError, OSError) as e:
        raise HTTPException(status_code=500, detail=f"Backup failed: {e}")
    if r.returncode != 0:
        raise HTTPException(status_code=500, detail="Backup failed: " + (r.stderr or r.stdout)[-400:])
    return {"output": r.stdout.strip()}


@router.get("/backups/{name}")
def download_backup(name: str, current_user: User = Depends(get_current_admin_user)):
    # Only plain file names of existing dumps, never paths.
    path = BACKUP_DIR / name
    if not re.fullmatch(r"[A-Za-z0-9._-]+\.dump", name) or not path.is_file():
        raise HTTPException(status_code=404, detail="Backup not found")
    return FileResponse(path, media_type="application/octet-stream", filename=name)



RESTORE_SCRIPT = APP_DIR / "scripts" / "restore-db.sh"
MAX_UPLOAD = 200 * 1024 * 1024


@router.post("/backups/upload")
async def upload_backup(file: UploadFile = File(...), current_user: User = Depends(get_current_admin_user)):
    """Stores an uploaded pg_dump next to the other backups, so it can be restored from the list."""
    head = await file.read(5)
    if head != b"PGDMP":
        raise HTTPException(status_code=400, detail="Not a Project Manager backup (expected a pg_dump .dump file)")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(BACKUP_DIR, 0o700)
    name = f"projectmanager-{time.strftime('%Y%m%d-%H%M%S')}-uploaded.dump"
    path = BACKUP_DIR / name
    size = len(head)
    with open(path, "wb") as out:
        out.write(head)
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD:
                out.close()
                path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Backup file too large")
            out.write(chunk)
    os.chmod(path, 0o600)
    return {"name": name, "size": size}


@router.post("/backups/{name}/restore")
def restore_backup(name: str, current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    """Replaces the whole database with a backup (see scripts/restore-db.sh)."""
    if os.name != "posix":
        raise HTTPException(status_code=400, detail="Restore only works on the Linux deployment.")
    path = BACKUP_DIR / name
    if not re.fullmatch(r"[A-Za-z0-9._-]+\.dump", name) or not path.is_file():
        raise HTTPException(status_code=404, detail="Backup not found")
    # This request's own session holds locks (the auth lookup read the users
    # table); release them, or dropping the tables would wait on us forever.
    db.rollback()
    db.close()
    engine.dispose()
    try:
        r = subprocess.run(["bash", str(RESTORE_SCRIPT), str(path)], cwd=APP_DIR,
                           capture_output=True, text=True, timeout=600)
    except (subprocess.SubprocessError, OSError) as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {e}")
    finally:
        engine.dispose()  # drop pooled connections that saw the old tables
    output = (r.stdout + r.stderr).strip()
    if r.returncode != 0:
        raise HTTPException(status_code=500, detail="Restore failed: " + output[-800:])
    return {"output": output}


@router.delete("/backups/{name}")
def delete_backup(name: str, current_user: User = Depends(get_current_admin_user)):
    path = BACKUP_DIR / name
    if not re.fullmatch(r"[A-Za-z0-9._-]+\.dump", name) or not path.is_file():
        raise HTTPException(status_code=404, detail="Backup not found")
    path.unlink()
    return {"ok": True}
