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

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user, get_current_admin_user
from app.models import User

router = APIRouter()

APP_DIR = Path(__file__).resolve().parents[3]
UPDATE_SCRIPT = APP_DIR / "scripts" / "update.sh"
STATE_DIR = APP_DIR / ".update"
STATUS_FILE = STATE_DIR / "status"
LOG_FILE = STATE_DIR / "update.log"
STALE_AFTER = 30 * 60  # seconds

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
        "update_available": head.strip() != target.strip(),
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
