"""iCalendar (.ics) feed of a user's open tasks with deadlines, for calendar
apps that subscribe to a URL (routers/calendar.py). Deadlines are dates, so
events are all-day; repeating tasks become series (RRULE) where the rule is
known in advance (not for "counted from completion")."""
from datetime import datetime, timedelta

from app.models import Task, TaskStatus
from app.timeutil import utcnow

DAYS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")
WORKDAYS = "MO,TU,WE,TH,FR"
FREQ = {"day": "DAILY", "week": "WEEKLY", "month": "MONTHLY", "year": "YEARLY"}

LABELS = {
    "en": {"project": "Project", "labels": "Labels", "priority": "Priority", "assignee": "Assigned to",
           "subtask": "Subtask of", "open": "Open", "priorities": ["Low", "Medium", "High", "Critical"]},
    "de": {"project": "Projekt", "labels": "Labels", "priority": "Priorität", "assignee": "Zuständig",
           "subtask": "Unteraufgabe von", "open": "Öffnen", "priorities": ["Niedrig", "Mittel", "Hoch", "Kritisch"]},
}


def escape(text: str) -> str:
    return (text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\n").replace("\n", "\\n")


def fold(line: str) -> str:
    """Lines longer than 75 octets continue on the next line after a space
    (RFC 5545 3.1), without splitting a UTF-8 character."""
    out, current, size = [], "", 0
    for ch in line:
        n = len(ch.encode("utf-8"))
        limit = 75 if not out else 74
        if size + n > limit:
            out.append(current)
            current, size = "", 0
        current += ch
        size += n
    out.append(current)
    return "\r\n ".join(out)


def _date(d: datetime) -> str:
    return d.strftime("%Y%m%d")


def _stamp(d: datetime) -> str:
    return d.strftime("%Y%m%dT%H%M%SZ")


def rrule(task: Task):
    """The repeat rule as an RRULE, or None when it can't be known upfront."""
    unit = task.recurrence_unit
    if not unit or task.recurrence_from == "completion" or not task.deadline:
        return None
    n = task.recurrence_interval or 1
    parts = [f"FREQ={FREQ[unit]}", f"INTERVAL={n}"]
    if unit == "week" and task.recurrence_weekdays:
        parts.append("BYDAY=" + ",".join(DAYS[d] for d in task.recurrence_weekdays))
    if unit in ("month", "year"):
        deadline = task.deadline
        mode = task.recurrence_monthly
        if unit == "year" and mode:
            parts.append(f"BYMONTH={deadline.month}")
        if mode == "last_day":
            parts.append("BYMONTHDAY=-1")
        elif mode == "last_workday":
            parts += [f"BYDAY={WORKDAYS}", "BYSETPOS=-1"]
        elif mode == "first_workday":
            parts += [f"BYDAY={WORKDAYS}", "BYSETPOS=1"]
        elif mode in ("weekday", "last_weekday"):
            nth = (deadline.day - 1) // 7 + 1
            nth = -1 if mode == "last_weekday" or nth >= 5 else nth
            parts.append(f"BYDAY={nth}{DAYS[deadline.weekday()]}")
        elif not mode and deadline.day == 31:
            parts.append("BYMONTHDAY=-1")  # the app clamps 31st to the month's last day
    return ";".join(parts)


def build_calendar(tasks, *, name: str, base_url: str, project_label, label_names, user_names, lang: str,
                   parents) -> str:
    """tasks: visible open tasks with a deadline. project_label(id) -> text,
    label_names(task) -> [names], user_names: {id: name}, parents: {id: task}."""
    words = LABELS.get(lang, LABELS["en"])
    now = _stamp(utcnow())
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Project Manager//Tasks//EN", "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH", f"X-WR-CALNAME:{escape(name)}", "X-PUBLISHED-TTL:PT1H",
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    ]
    for t in tasks:
        parent = parents.get(t.parent_task_id) if t.parent_task_id else None
        project_id = t.project_id if t.project_id is not None else (parent.project_id if parent else None)
        labels = label_names(t)
        details = []
        if project_id is not None:
            details.append(f"{words['project']}: {project_label(project_id)}")
        if parent:
            details.append(f"{words['subtask']}: {parent.title}")
        if t.priority:
            names = words["priorities"]
            details.append(f"{words['priority']}: {names[t.priority] if 0 <= t.priority < len(names) else t.priority}")
        if t.assignee_id and t.assignee_id in user_names:
            details.append(f"{words['assignee']}: {user_names[t.assignee_id]}")
        if labels:
            details.append(f"{words['labels']}: {', '.join(labels)}")
        if t.description:
            details += ["", t.description]
        link = f"{base_url}/?task={t.id}"
        details += ["", f"{words['open']}: {link}"]
        end = t.deadline.replace(hour=0, minute=0, second=0, microsecond=0)
        # With a start date the entry spans start … deadline; otherwise the deadline day.
        start = t.start_date.replace(hour=0, minute=0, second=0, microsecond=0) if t.start_date and t.start_date <= end else end
        summary = t.title if not parent else f"{t.title} ({parent.title})"
        if t.status == TaskStatus.IN_PROGRESS:
            summary = "▶ " + summary
        event = [
            "BEGIN:VEVENT",
            f"UID:{t.uid}@project-manager",
            f"DTSTAMP:{now}",
            f"LAST-MODIFIED:{_stamp(t.updated_at or utcnow())}",
            f"DTSTART;VALUE=DATE:{_date(start)}",
            f"DTEND;VALUE=DATE:{_date(end + timedelta(days=1))}",
            f"SUMMARY:{escape(summary)}",
            f"DESCRIPTION:{escape(chr(10).join(details))}",
            f"URL:{link}",
            "TRANSP:TRANSPARENT",  # a deadline doesn't make you busy
        ]
        if labels:
            event.append("CATEGORIES:" + ",".join(escape(n) for n in labels))
        rule = rrule(t)
        if rule:
            event.append(f"RRULE:{rule}")
        event.append("END:VEVENT")
        lines += event
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold(line) for line in lines) + "\r\n"
