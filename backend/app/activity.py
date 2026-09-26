"""Activity log per task: who created it and changed what, when. Values are
stored as display text at the time of the change (names, not ids), so the
history stays readable after users or projects are renamed or deleted."""
from sqlalchemy.orm import Session

from app.models import Project, Task, TaskActivity, User

# Changes worth showing; order, parent and completed_at are bookkeeping.
TRACKED = ("title", "description", "status", "priority", "deadline", "assignee_id", "project_id", "recurrence", "labels")


def _status(task: Task):
    return task.status.value if task.status is not None else None


def _recurrence(task: Task):
    return f"{task.recurrence_unit}:{task.recurrence_interval or 1}" if task.recurrence_unit else None


def snapshot(task: Task) -> dict:
    return {
        "title": task.title,
        "description": task.description or "",
        "status": _status(task),
        "priority": task.priority,
        "deadline": task.deadline.date().isoformat() if task.deadline else None,
        "assignee_id": task.assignee_id,
        "project_id": task.project_id,
        "recurrence": _recurrence(task),
        "labels": ", ".join(sorted(l.name for l in task.labels)) or None,
    }


def _user_name(db: Session, user_id):
    user = db.get(User, user_id) if user_id is not None else None
    return user.username if user else None


def _project_name(db: Session, project_id):
    project = db.get(Project, project_id) if project_id is not None else None
    if not project:
        return None
    parent = db.get(Project, project.parent_id) if project.parent_id else None
    return f"{parent.name} / {project.name}" if parent else project.name


def _text(value):
    if value is None:
        return None
    value = str(value)
    return value if len(value) <= 300 else value[:299] + "…"


def _add(db: Session, task: Task, actor: User, kind: str, old=None, new=None):
    db.add(TaskActivity(task_id=task.id, actor_id=actor.id if actor else None, kind=kind,
                        old_value=_text(old), new_value=_text(new)))


def created(db: Session, task: Task, actor: User):
    _add(db, task, actor, "created")


def changed(db: Session, task: Task, before: dict, actor: User):
    """One entry per tracked field that differs from `before` (a snapshot)."""
    after = snapshot(task)
    for field in TRACKED:
        old, new = before[field], after[field]
        if old == new:
            continue
        if field == "description":
            _add(db, task, actor, "description")  # the text itself would be noise
        elif field == "assignee_id":
            _add(db, task, actor, "assignee", _user_name(db, old), _user_name(db, new))
        elif field == "project_id":
            _add(db, task, actor, "project", _project_name(db, old), _project_name(db, new))
        else:
            _add(db, task, actor, field, old, new)


def repeated(db: Session, done: Task, nxt: Task, actor: User):
    """A repeating task was completed and created its next occurrence."""
    due = nxt.deadline.date().isoformat() if nxt.deadline else None
    _add(db, done, actor, "next_created", None, due)
    _add(db, nxt, actor, "repeat_of", done.id, due)
