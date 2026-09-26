"""The current user's notifications (the bell)."""
from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import access
from app.auth import get_current_user
from app.database import get_db
from app.models import Notification, User
from app.timeutil import utcnow

router = APIRouter()

KEEP_READ_DAYS = 60


class MarkRead(BaseModel):
    ids: Optional[List[int]] = None  # None: all of mine


@router.get("/")
def list_notifications(limit: int = 50, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Housekeeping: read notifications don't need to live forever.
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read_at.isnot(None),
        Notification.read_at < utcnow() - timedelta(days=KEEP_READ_DAYS),
    ).delete(synchronize_session=False)
    db.commit()

    # Tasks in private projects the user has left (or was removed from) are
    # hidden, notifications about them too.
    visible = access.visible_project_ids(db, current_user)
    seen = lambda n: n.task is None or access.task_visible(db, current_user, n.task, visible)  # noqa: E731
    base = db.query(Notification).filter(Notification.user_id == current_user.id)
    items = [n for n in base.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(max(1, min(limit, 200)))
             if seen(n)]
    return {
        "unread": sum(1 for n in base.filter(Notification.read_at.is_(None)) if seen(n)),
        "items": [
            {
                "id": n.id,
                "kind": n.kind,
                "task_id": n.task_id,
                "task_title": n.task.title if n.task else None,
                "actor": n.actor.username if n.actor else None,
                "excerpt": n.excerpt,
                "created_at": n.created_at,
                "read": n.read_at is not None,
            }
            for n in items
        ],
    }


@router.post("/read")
def mark_read(data: MarkRead, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(Notification).filter(Notification.user_id == current_user.id, Notification.read_at.is_(None))
    if data.ids is not None:
        q = q.filter(Notification.id.in_(data.ids))
    n = q.update({Notification.read_at: utcnow()}, synchronize_session=False)
    db.commit()
    return {"marked": n}
