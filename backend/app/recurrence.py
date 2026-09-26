"""Recurring tasks: when a repeating task is ticked off, the next occurrence
is created with the deadline moved forward (and its subtasks copied as a
fresh checklist)."""
import calendar
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import Task, TaskStatus
from app.timeutil import utcnow

UNITS = ("day", "week", "month", "year")


def add_interval(when: datetime, unit: str, n: int) -> datetime:
    if unit == "day":
        return when + timedelta(days=n)
    if unit == "week":
        return when + timedelta(weeks=n)
    months = n * (12 if unit == "year" else 1)
    y, m = divmod(when.month - 1 + months, 12)
    year, month = when.year + y, m + 1
    # 31 Jan + 1 month -> 28/29 Feb
    day = min(when.day, calendar.monthrange(year, month)[1])
    return when.replace(year=year, month=month, day=day)


def next_deadline(deadline, unit: str, n: int, now: datetime) -> datetime:
    """Follows the schedule, not the completion date; skips ahead past today
    so a late finish doesn't create an already-overdue task."""
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    nxt = add_interval(deadline or today, unit, n)
    guard = 0
    while nxt < today and guard < 10000:
        nxt = add_interval(nxt, unit, n)
        guard += 1
    return nxt


def _copy_subtasks(db: Session, source: Task, target: Task, shift: timedelta):
    for sub in source.subtasks:
        copy = Task(
            title=sub.title, description=sub.description, status=TaskStatus.TODO, priority=sub.priority,
            order=sub.order, deadline=(sub.deadline + shift) if sub.deadline else None,
            project_id=sub.project_id, parent_task_id=target.id, assignee_id=sub.assignee_id,
            recurrence_unit=sub.recurrence_unit, recurrence_interval=sub.recurrence_interval,
            labels=list(sub.labels),
        )
        db.add(copy)
        db.flush()
        _copy_subtasks(db, sub, copy, shift)


def spawn_next(db: Session, task: Task):
    """Create the next occurrence of a repeating task that was just completed.
    Returns the new task, or None (not repeating / already created)."""
    if task.status != TaskStatus.DONE or not task.recurrence_unit:
        return None
    if task.recurrence_next_id is not None and db.get(Task, task.recurrence_next_id) is not None:
        return None  # ticked, unticked, ticked again: the next one exists already
    n = task.recurrence_interval or 1
    base = task.deadline
    nxt_deadline = next_deadline(base, task.recurrence_unit, n, utcnow())
    shift = (nxt_deadline - base) if base else timedelta(0)
    nxt = Task(
        title=task.title, description=task.description, status=TaskStatus.TODO, priority=task.priority,
        order=task.order, deadline=nxt_deadline, project_id=task.project_id,
        parent_task_id=task.parent_task_id, assignee_id=task.assignee_id,
        recurrence_unit=task.recurrence_unit, recurrence_interval=n, labels=list(task.labels),
    )
    db.add(nxt)
    db.flush()
    _copy_subtasks(db, task, nxt, shift)
    task.recurrence_next_id = nxt.id
    return nxt
