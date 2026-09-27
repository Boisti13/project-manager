"""One call for clients that keep their own copy (offline apps): everything
the user can see, or only what changed since a cursor. See docs/API.md."""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app import access, schemas
from app.auth import get_current_user
from app.database import get_db
from app.models import Deletion, Label, Project, Task, TaskComment, User
from app.routers.comments import to_schema as comment_schema
from app.routers.labels import label_schema
from app.timeutil import utcnow

router = APIRouter()

# Changes committed while a sync runs may carry a timestamp just before the
# cursor; asking a bit further back catches them (clients just get a few
# objects twice).
OVERLAP = timedelta(seconds=5)


def _parse_cursor(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value).replace(tzinfo=None)
    except ValueError:
        raise HTTPException(status_code=422, detail="since must be a cursor from a previous sync (ISO timestamp)")


@router.get("/", response_model=schemas.SyncResponse)
def sync(
    since: Optional[str] = Query(default=None, description="Cursor from the previous sync; omit for everything"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cursor = utcnow()
    after = _parse_cursor(since) - OVERLAP if since else None

    visible_projects = access.visible_project_ids(db, current_user)
    all_tasks = access.filter_tasks(db, current_user, db.query(Task).options(
        selectinload(Task.labels), selectinload(Task.blocked_by)).all())
    projects = [p for p in db.query(Project).order_by(Project.id) if access.project_visible(visible_projects, p.id)]
    labels = db.query(Label).order_by(Label.id).all()

    changed = lambda row: after is None or (row.updated_at is not None and row.updated_at > after)  # noqa: E731
    tasks = [t for t in all_tasks if changed(t)]
    task_ids = {t.id for t in all_tasks}
    changed_task_ids = {t.id for t in tasks}

    comment_q = db.query(TaskComment).filter(TaskComment.task_id.in_(task_ids)) if task_ids else None
    if comment_q is not None and after is not None:
        # new or edited comments, and all comments of tasks that are sent anyway
        newer = [TaskComment.created_at > after, TaskComment.edited_at > after]
        if changed_task_ids:
            newer.append(TaskComment.task_id.in_(changed_task_ids))
        comment_q = comment_q.filter(or_(*newer))
    comments = comment_q.order_by(TaskComment.id).all() if comment_q is not None else []

    label_counts = {}
    for t in all_tasks:
        for lid in t.label_ids:
            label_counts[lid] = label_counts.get(lid, 0) + 1

    deletions = []
    if after is not None:
        rows = db.query(Deletion).filter(Deletion.deleted_at > after).order_by(Deletion.deleted_at, Deletion.id)
        deletions = [schemas.DeletionEntry(entity=d.entity, id=d.entity_id, uid=d.uid, deleted_at=d.deleted_at) for d in rows]

    return schemas.SyncResponse(
        cursor=cursor.isoformat(),
        full=after is None,
        tasks=[schemas.SyncTask.model_validate(t) for t in tasks],
        projects=[p for p in projects if changed(p)],
        labels=[label_schema(lab, label_counts.get(lab.id, 0)) for lab in labels if changed(lab)],
        comments=[comment_schema(c) for c in comments],
        users=[schemas.SyncUser(id=u.id, username=u.username, is_active=bool(u.is_active))
               for u in db.query(User).order_by(User.id)],
        deletions=deletions,
        ids=schemas.SyncIds(tasks=sorted(task_ids), projects=[p.id for p in projects], labels=[lab.id for lab in labels]),
    )
