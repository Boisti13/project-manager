"""Creating notifications. Callers add them to the session; the caller's
commit saves them together with the change that caused them."""
import re

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import access
from app.models import Notification, Task, TaskComment, User

# "@anna" / "@anna.b" in a comment; not "a@b.de" (e-mail), trailing dots etc. left out.
MENTION = re.compile(r"(?<![\w@])@([\w.\-]*\w)")


def mentioned_ids(db: Session, text: str) -> set:
    """Ids of the users named with @username in `text` (any case)."""
    names = {m.lower() for m in MENTION.findall(text or "")}
    if not names:
        return set()
    return {uid for (uid,) in db.query(User.id).filter(func.lower(User.username).in_(names))}


def _active(db: Session, user_id) -> bool:
    if user_id is None:
        return False
    user = db.get(User, user_id)
    return bool(user and user.is_active)


def assigned(db: Session, task: Task, actor: User, count: int = 1):
    """`task` was assigned to task.assignee_id by `actor` (count > 1: a bulk
    add of that many tasks, reported as one notification)."""
    if task.assignee_id == actor.id or not _active(db, task.assignee_id):
        return
    excerpt = f"and {count - 1} more task{'s' if count > 2 else ''}" if count > 1 else None
    db.add(Notification(user_id=task.assignee_id, kind="assigned", task_id=task.id,
                        actor_id=actor.id, excerpt=excerpt))


def commented(db: Session, comment: TaskComment, actor: User, previous_body=None):
    """Tell the task's assignee and everyone else who commented on it, and
    whoever it @mentions ("mentioned you" instead of "commented"). After an
    edit (previous_body given), only people newly mentioned hear about it.
    Mentions of people who can't see the task are ignored."""
    task = db.get(Task, comment.task_id)
    mentioned = mentioned_ids(db, comment.body)
    if previous_body is None:
        recipients = {task.assignee_id} if task else set()
        recipients |= {uid for (uid,) in db.query(TaskComment.author_id).filter(TaskComment.task_id == comment.task_id)}
    else:
        recipients = set()
        mentioned -= mentioned_ids(db, previous_body)
    recipients |= mentioned
    recipients.discard(actor.id)
    recipients.discard(None)
    body = " ".join(comment.body.split())
    excerpt = body if len(body) <= 140 else body[:139] + "…"
    for uid in sorted(recipients):
        if _active(db, uid) and task and access.task_visible(db, db.get(User, uid), task):
            db.add(Notification(user_id=uid, kind="mention" if uid in mentioned else "comment",
                                task_id=comment.task_id, actor_id=actor.id, excerpt=excerpt))
