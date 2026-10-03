"""What's up for one user, in a few numbers and short lists -- for Home
Assistant (polled: GET /api/v1/summary, routers/summary.py; pushed:
app/mqtt.py) or anything else that wants a glance.

Deadlines count like the bell: open tasks assigned to the user or to nobody,
not in archived projects. "Today" is the server's local date. With a
workspace, only that workspace of the user's (plus the projects in no
workspace, when the user shows those everywhere)."""
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app import access
from app.models import Notification, Project, ProjectWorkspace, Task, TaskStatus, User, Workspace
from app.timeutil import utcnow

SOON_DAYS = 3  # "due soon": the next three days after today
LIST_MAX = 20  # tasks per list


def local_today() -> date:
    return datetime.now().date()


def user_workspace(db: Session, user: User, workspace_id: Optional[int]) -> Optional[Workspace]:
    """The user's workspace `workspace_id`; None for none; ValueError if it isn't theirs."""
    if workspace_id is None:
        return None
    ws = db.get(Workspace, workspace_id)
    if ws is None or ws.user_id != user.id:
        raise ValueError("Unknown workspace")
    return ws


class Scope:
    """Which tasks count for `user` (visible, not archived, in the workspace)."""

    def __init__(self, db: Session, user: User, workspace: Optional[Workspace] = None):
        self.db, self.user, self.workspace = db, user, workspace
        self.projects = {p.id: p for p in db.query(Project)}
        self.filing = {a.project_id: a.workspace_id
                       for a in db.query(ProjectWorkspace).filter(ProjectWorkspace.user_id == user.id)} if workspace else {}
        self._tasks = {}

    def _task(self, task_id):
        if task_id not in self._tasks:
            self._tasks[task_id] = self.db.get(Task, task_id)
        return self._tasks[task_id]

    def top_of(self, task: Task) -> Optional[Project]:
        cur = task
        while cur is not None:
            if cur.project_id is not None:
                p = self.projects.get(cur.project_id)
                return self.projects.get(p.parent_id) if p is not None and p.parent_id else p
            cur = self._task(cur.parent_task_id) if cur.parent_task_id else None
        return None

    def project_label(self, task: Task) -> str:
        cur = task
        while cur is not None and cur.project_id is None:
            cur = self._task(cur.parent_task_id) if cur.parent_task_id else None
        p = self.projects.get(cur.project_id) if cur is not None else None
        if p is None:
            return ""
        parent = self.projects.get(p.parent_id) if p.parent_id else None
        return f"{parent.name} / {p.name}" if parent else p.name

    def counts(self, task: Task) -> bool:
        top = self.top_of(task)
        if top is not None and top.archived_at is not None:
            return False
        if self.workspace is None:
            return True
        filed = self.filing.get(top.id) if top is not None else None
        return filed == self.workspace.id or (filed is None and self.user.workspace_unassigned_everywhere)


def _item(scope: Scope, task: Task, today: date, base_url: str) -> dict:
    due = task.deadline.date() if task.deadline else None
    out = {
        "id": task.id,
        "title": task.title,
        "project": scope.project_label(task),
        "deadline": due.isoformat() if due else None,
        "priority": task.priority,
        "overdue": bool(due and due < today),
    }
    if base_url:
        out["url"] = f"{base_url}/?task={task.id}"
    return out


def build(db: Session, user: User, workspace: Optional[Workspace] = None, base_url: str = "",
          today: Optional[date] = None) -> dict:
    today = today or local_today()
    scope = Scope(db, user, workspace)
    open_tasks = [t for t in access.filter_tasks(db, user, db.query(Task).filter(Task.status != TaskStatus.DONE))
                  if scope.counts(t)]
    mine = [t for t in open_tasks if t.assignee_id in (None, user.id)]
    due = lambda t: t.deadline.date() if t.deadline else None  # noqa: E731
    by_deadline = lambda ts: sorted(ts, key=lambda t: (t.deadline, -(t.priority or 0), t.id))  # noqa: E731
    overdue = by_deadline([t for t in mine if due(t) and due(t) < today])
    due_today = by_deadline([t for t in mine if due(t) == today])
    due_soon = by_deadline([t for t in mine if due(t) and today < due(t) <= today + timedelta(days=SOON_DAYS)])

    visible = access.visible_project_ids(db, user)
    notes = [n for n in db.query(Notification).filter(Notification.user_id == user.id)
             .order_by(Notification.created_at.desc(), Notification.id.desc())
             if n.task is None or (access.task_visible(db, user, n.task, visible) and scope.counts(n.task))]
    unread = [n for n in notes if n.read_at is None]
    latest = notes[0] if notes else None

    items = lambda ts: [_item(scope, t, today, base_url) for t in ts[:LIST_MAX]]  # noqa: E731
    return {
        "user": user.username,
        "workspace": workspace.name if workspace else None,
        "unread_notifications": len(unread),
        "overdue": len(overdue),
        "due_today": len(due_today),
        "due_soon": len(due_soon),
        "open_assigned": sum(1 for t in open_tasks if t.assignee_id == user.id),
        "overdue_tasks": items(overdue),
        "due_today_tasks": items(due_today),
        "due_soon_tasks": items(due_soon),
        "latest_notification": None if latest is None else {
            "kind": latest.kind,
            "task_id": latest.task_id,
            "task_title": latest.task.title if latest.task else None,
            "actor": latest.actor.username if latest.actor else None,
            "excerpt": latest.excerpt,
            "created_at": latest.created_at.isoformat() + "Z" if latest.created_at else None,
            "read": latest.read_at is not None,
        },
        "updated_at": utcnow().isoformat(timespec="seconds") + "Z",
    }
