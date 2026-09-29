"""Recurring tasks: when a repeating task is ticked off, the next occurrence
is created with the deadline moved forward (and its subtasks copied as a
fresh checklist).

A rule is: every `interval` days / weeks / months / years, plus optionally
- weekdays (weeks only): on these days, e.g. Mon + Thu (0 = Monday);
- monthly mode (months/years): the last day, the last or first workday, the
  same weekday position (e.g. 2nd Tuesday) or the last such weekday;
- counted from completion instead of from the schedule.
"""
import calendar
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.models import Task, TaskStatus
from app.timeutil import utcnow

UNITS = ("day", "week", "month", "year")
MONTHLY_MODES = ("last_day", "last_workday", "first_workday", "weekday", "last_weekday")


@dataclass(frozen=True)
class Rule:
    unit: str
    interval: int = 1
    weekdays: Tuple[int, ...] = ()  # 0 = Monday
    monthly: Optional[str] = None
    from_completion: bool = False

    @classmethod
    def of(cls, task) -> "Rule":
        return cls(
            unit=task.recurrence_unit,
            interval=task.recurrence_interval or 1,
            weekdays=tuple(task.recurrence_weekdays or ()),
            monthly=task.recurrence_monthly,
            from_completion=task.recurrence_from == "completion",
        )


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


def _midnight(when: datetime) -> datetime:
    return when.replace(hour=0, minute=0, second=0, microsecond=0)


def _is_workday(day: datetime) -> bool:
    return day.weekday() < 5


def _in_month(year: int, month: int, start: datetime, mode: Optional[str]) -> datetime:
    """The day in (year, month) that `mode` picks, `start` giving the day /
    weekday position it's based on."""
    last = calendar.monthrange(year, month)[1]
    first_day = start.replace(year=year, month=month, day=1)
    if mode == "last_day":
        return first_day.replace(day=last)
    if mode == "last_workday":
        day = first_day.replace(day=last)
        while not _is_workday(day):
            day -= timedelta(days=1)
        return day
    if mode == "first_workday":
        day = first_day
        while not _is_workday(day):
            day += timedelta(days=1)
        return day
    if mode in ("weekday", "last_weekday"):
        weekday = start.weekday()
        if mode == "last_weekday":
            day = first_day.replace(day=last)
            while day.weekday() != weekday:
                day -= timedelta(days=1)
            return day
        nth = (start.day - 1) // 7  # 0 = first
        day = first_day + timedelta(days=(weekday - first_day.weekday()) % 7 + 7 * nth)
        if day.month != month:  # a 5th weekday that this month doesn't have: the last one
            day -= timedelta(days=7)
        return day
    return first_day.replace(day=min(start.day, last))  # the same day, clamped (31 Jan -> 28 Feb)


def next_occurrence(start: datetime, rule: Rule) -> datetime:
    """The first date of `rule` after `start`."""
    n = rule.interval or 1
    if rule.unit == "day":
        return start + timedelta(days=n)
    if rule.unit == "week":
        if not rule.weekdays:
            return start + timedelta(weeks=n)
        days = sorted(set(rule.weekdays))
        later = [d for d in days if d > start.weekday()]
        if later:  # still this week
            return start + timedelta(days=later[0] - start.weekday())
        monday = start - timedelta(days=start.weekday())
        return monday + timedelta(weeks=n, days=days[0])
    months = n * (12 if rule.unit == "year" else 1)
    y, m = divmod(start.month - 1 + months, 12)
    return _in_month(start.year + y, m + 1, start, rule.monthly)


def next_deadline(deadline, rule: Rule, now: datetime, completed_at=None) -> datetime:
    """The next occurrence's deadline. From the schedule (the default), the
    next date after the current deadline, skipping ahead past today so a late
    finish doesn't create an already-overdue task; from completion, the next
    date after the day it was done."""
    today = _midnight(now)
    if rule.from_completion:
        return next_occurrence(_midnight(completed_at or now), rule)
    nxt = next_occurrence(_midnight(deadline) if deadline else today, rule)
    guard = 0
    while nxt < today and guard < 10000:
        nxt = next_occurrence(nxt, rule)
        guard += 1
    return nxt


def _copy_subtasks(db: Session, source: Task, target: Task, shift: timedelta):
    for sub in source.subtasks:
        copy = Task(
            title=sub.title, description=sub.description, status=TaskStatus.TODO, priority=sub.priority,
            order=sub.order, deadline=(sub.deadline + shift) if sub.deadline else None,
            start_date=(sub.start_date + shift) if sub.start_date else None,
            estimate_minutes=sub.estimate_minutes,
            project_id=sub.project_id, parent_task_id=target.id, assignee_id=sub.assignee_id,
            recurrence_unit=sub.recurrence_unit, recurrence_interval=sub.recurrence_interval,
            recurrence_weekdays=sub.recurrence_weekdays, recurrence_monthly=sub.recurrence_monthly,
            recurrence_from=sub.recurrence_from, labels=list(sub.labels),
        )
        db.add(copy)
        db.flush()
        _copy_subtasks(db, sub, copy, shift)


def _untouched(db: Session, task: Task) -> bool:
    """Created as the next occurrence and not worked on since: still To Do,
    no comments, no history beyond being created (also for its subtasks)."""
    from app.models import TaskActivity, TaskComment
    ids, stack = [], [task]
    while stack:
        t = stack.pop()
        if t.status != TaskStatus.TODO and t is task:
            return False
        ids.append(t.id)
        stack.extend(t.subtasks)
    if db.query(TaskComment.id).filter(TaskComment.task_id.in_(ids)).first():
        return False
    other = db.query(TaskActivity.id).filter(
        TaskActivity.task_id.in_(ids), TaskActivity.kind.notin_(("created", "repeat_of"))
    ).first()
    return other is None


def take_back_next(db: Session, task: Task, actor) -> None:
    """`task` was reopened: remove the occurrence its completion created, if
    it's untouched (ticked by mistake, or undone), so ticking it again
    creates a fresh one. An occurrence someone worked on stays."""
    from app import tombstones
    nxt = db.get(Task, task.recurrence_next_id) if task.recurrence_next_id else None
    if nxt is None or not _untouched(db, nxt):
        return
    tombstones.task_deleted(db, nxt, actor)
    task.recurrence_next_id = None
    db.delete(nxt)


def spawn_next(db: Session, task: Task):
    """Create the next occurrence of a repeating task that was just completed.
    Returns the new task, or None (not repeating / already created)."""
    if task.status != TaskStatus.DONE or not task.recurrence_unit:
        return None
    if task.recurrence_next_id is not None and db.get(Task, task.recurrence_next_id) is not None:
        return None  # ticked, unticked, ticked again: the next one exists already
    n = task.recurrence_interval or 1
    base = task.deadline
    nxt_deadline = next_deadline(base, Rule.of(task), utcnow(), completed_at=task.completed_at)
    shift = (nxt_deadline - base) if base else timedelta(0)
    nxt = Task(
        title=task.title, description=task.description, status=TaskStatus.TODO, priority=task.priority,
        estimate_minutes=task.estimate_minutes,
        start_date=(task.start_date + shift) if task.start_date else None,
        order=task.order, deadline=nxt_deadline, project_id=task.project_id,
        parent_task_id=task.parent_task_id, assignee_id=task.assignee_id,
        recurrence_unit=task.recurrence_unit, recurrence_interval=n, recurrence_weekdays=task.recurrence_weekdays,
        recurrence_monthly=task.recurrence_monthly, recurrence_from=task.recurrence_from, labels=list(task.labels),
    )
    db.add(nxt)
    db.flush()
    _copy_subtasks(db, task, nxt, shift)
    task.recurrence_next_id = nxt.id
    return nxt
