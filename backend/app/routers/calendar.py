"""Calendar feed: a private .ics URL per user that calendar apps subscribe to.
Calendar apps can't log in, so the URL itself carries a secret; it can be
reset (the old URL stops working)."""
import secrets
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from app import access
from app.auth import get_current_user
from app.calendar_feed import build_calendar
from app.database import get_db
from app.models import Project, ProjectWorkspace, Task, TaskStatus, User, Workspace

router = APIRouter()


class FeedInfo(BaseModel):
    path: str  # append ?scope=mine|all, optionally &workspace=<id>


def _new_token() -> str:
    return secrets.token_urlsafe(24)


def _info(user: User) -> FeedInfo:
    return FeedInfo(path=f"/api/v1/calendar/{user.calendar_token}.ics")


@router.get("/feed", response_model=FeedInfo)
def feed_info(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.get(User, current_user.id)
    if not user.calendar_token:
        user.calendar_token = _new_token()
        db.commit()
    return _info(user)


@router.post("/feed/reset", response_model=FeedInfo)
def reset_feed(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.get(User, current_user.id)
    user.calendar_token = _new_token()
    db.commit()
    return _info(user)


@router.get("/{token}.ics", include_in_schema=True)
def calendar(token: str, request: Request, scope: Literal["mine", "all"] = Query(default="mine"),
             workspace: Optional[int] = Query(default=None), db: Session = Depends(get_db)):
    """The feed (no login: the token in the URL is the key). scope=mine: tasks
    assigned to you or to nobody; all: everything you can see. workspace: only
    the projects in that workspace of yours (plus the ones in no workspace,
    when you show those everywhere)."""
    user = db.query(User).filter(User.calendar_token == token).first() if token else None
    if user is None or not user.is_active:
        raise HTTPException(status_code=404, detail="Unknown calendar")
    ws = db.get(Workspace, workspace) if workspace is not None else None
    if workspace is not None and (ws is None or ws.user_id != user.id):
        raise HTTPException(status_code=404, detail="Unknown calendar")

    rows = db.query(Task).options(selectinload(Task.labels)).filter(Task.status != TaskStatus.DONE).all()
    visible = access.filter_tasks(db, user, rows)
    parents = {t.id: t for t in db.query(Task).filter(Task.id.in_({t.parent_task_id for t in visible if t.parent_task_id}))} \
        if any(t.parent_task_id for t in visible) else {}
    tasks = [t for t in visible if t.deadline and (scope == "all" or t.assignee_id in (None, user.id))]
    tasks.sort(key=lambda t: (t.deadline, t.id))

    projects = {p.id: p for p in db.query(Project)}

    def top_of(task):
        pid = task.project_id if task.project_id is not None else (
            parents[task.parent_task_id].project_id if task.parent_task_id in parents else None)
        p = projects.get(pid)
        return projects.get(p.parent_id) if p is not None and p.parent_id else p

    tasks = [task for task in tasks if top_of(task) is None or top_of(task).archived_at is None]
    if ws is not None:
        filing = {a.project_id: a.workspace_id for a in db.query(ProjectWorkspace).filter(ProjectWorkspace.user_id == user.id)}

        def in_workspace(task):
            top = top_of(task)
            filed = filing.get(top.id) if top is not None else None
            return filed == ws.id or (filed is None and user.workspace_unassigned_everywhere)

        tasks = [task for task in tasks if in_workspace(task)]

    def project_label(pid):
        p = projects.get(pid)
        if not p:
            return ""
        parent = projects.get(p.parent_id) if p.parent_id else None
        return f"{parent.name} / {p.name}" if parent else p.name

    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("host", request.url.netloc)
    body = build_calendar(
        tasks,
        name=f"Project Manager ({user.username}{' · ' + ws.name if ws else ''})",
        base_url=f"{proto}://{host}",
        project_label=project_label,
        label_names=lambda t: sorted(label.name for label in t.labels),
        user_names={u.id: u.username for u in db.query(User)},
        lang=user.language or "en",
        parents=parents,
    )
    return Response(content=body, media_type="text/calendar; charset=utf-8",
                    headers={"Content-Disposition": 'inline; filename="project-manager.ics"',
                             "Cache-Control": "no-cache"})
