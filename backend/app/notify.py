"""Creating notifications. Callers add them to the session; the caller's
commit saves them together with the change that caused them."""
from sqlalchemy.orm import Session

from app import access
from app.models import Notification, Task, TaskComment, User


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


def commented(db: Session, comment: TaskComment, actor: User):
    """Tell the task's assignee and everyone else who commented on it."""
    task = db.get(Task, comment.task_id)
    recipients = {task.assignee_id} if task else set()
    recipients |= {uid for (uid,) in db.query(TaskComment.author_id).filter(TaskComment.task_id == comment.task_id)}
    recipients.discard(actor.id)
    recipients.discard(None)
    body = " ".join(comment.body.split())
    excerpt = body if len(body) <= 140 else body[:139] + "…"
    for uid in sorted(recipients):
        if _active(db, uid) and task and access.task_visible(db, db.get(User, uid), task):
            db.add(Notification(user_id=uid, kind="comment", task_id=comment.task_id,
                                actor_id=actor.id, excerpt=excerpt))
