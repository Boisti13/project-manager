"""What was deleted since a point in time (app/tombstones.py), for clients
that keep a copy of the data. Entries only carry ids and uids."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import schemas
from app.auth import get_current_user
from app.database import get_db
from app.models import Deletion, User

router = APIRouter()


@router.get("/", response_model=list[schemas.DeletionEntry])
def list_deletions(
    since: Optional[datetime] = Query(default=None, description="Only deletions after this UTC time"),
    limit: int = Query(default=1000, ge=1, le=10000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Deletion)
    if since is not None:
        q = q.filter(Deletion.deleted_at > since.replace(tzinfo=None))
    rows = q.order_by(Deletion.deleted_at, Deletion.id).limit(limit).all()
    return [schemas.DeletionEntry(entity=d.entity, id=d.entity_id, uid=d.uid, deleted_at=d.deleted_at) for d in rows]
