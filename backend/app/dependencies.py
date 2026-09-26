"""Task dependencies: a task can wait for other tasks ("blocked by"). It's
shown as waiting while any of them is open; when the last one is done, the
waiting task's assignee is told it can start."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import access
from app.models import Notification, Task, TaskStatus, User, task_dependencies

MAX_BLOCKERS = 50


def set_blockers(db: Session, user: User, task: Task, ids) -> None:
    ids = list(dict.fromkeys(ids or []))
    if len(ids) > MAX_BLOCKERS:
        raise HTTPException(status_code=400, detail=f"At most {MAX_BLOCKERS} dependencies per task")
    if task.id is not None and task.id in ids:
        raise HTTPException(status_code=400, detail="A task can't wait for itself")
    blockers = []
    for bid in ids:
        b = db.get(Task, bid)
        if not b or not access.task_visible(db, user, b):
            raise HTTPException(status_code=400, detail=f"Task #{bid} not found")
        blockers.append(b)
    if task.id is not None:
        # No cycles: nothing we'd wait for may (indirectly) wait for us.
        seen, stack = set(), list(blockers)
        while stack:
            t = stack.pop()
            if t.id == task.id:
                raise HTTPException(status_code=400, detail="That would make the tasks wait for each other")
            if t.id in seen:
                continue
            seen.add(t.id)
            stack.extend(t.blocked_by)
    task.blocked_by = blockers


def waiting_tasks(db: Session, blocker: Task) -> list:
    """Tasks that wait for `blocker`."""
    ids = [tid for (tid,) in db.query(task_dependencies.c.task_id).filter(task_dependencies.c.blocked_by_id == blocker.id)]
    return db.query(Task).filter(Task.id.in_(ids)).all() if ids else []


def notify_unblocked(db: Session, done: Task, actor: User) -> None:
    """`done` was just completed: tell the assignees of tasks that now have
    nothing left to wait for."""
    for t in waiting_tasks(db, done):
        if t.status == TaskStatus.DONE or any(b.status != TaskStatus.DONE for b in t.blocked_by):
            continue
        assignee = db.get(User, t.assignee_id) if t.assignee_id else None
        if not assignee or assignee.id == actor.id or not assignee.is_active or not access.task_visible(db, assignee, t):
            continue
        excerpt = f"Done: {done.title}"
        db.add(Notification(user_id=assignee.id, kind="unblocked", task_id=t.id, actor_id=actor.id,
                            excerpt=excerpt if len(excerpt) <= 300 else excerpt[:299] + "…"))
