"""Saved filters: named task-list filters per user. Saving under an existing
name replaces that filter."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.auth import get_current_user
from app.database import get_db
from app.models import SavedFilter, User

router = APIRouter()

MAX_PER_USER = 50


@router.get("/", response_model=list[schemas.SavedFilter])
def list_filters(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(SavedFilter).filter(SavedFilter.user_id == current_user.id).all()
    return sorted(rows, key=lambda f: (f.name.lower(), f.id))


@router.post("/", response_model=schemas.SavedFilter)
def save_filter(data: schemas.SavedFilterCreate, current_user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    name = " ".join(data.name.split())
    if not name:
        raise HTTPException(status_code=422, detail="Name is empty")
    query = data.query.lstrip("?")
    mine = db.query(SavedFilter).filter(SavedFilter.user_id == current_user.id)
    row = mine.filter(SavedFilter.name == name).first()
    if row is None:
        if mine.count() >= MAX_PER_USER:
            raise HTTPException(status_code=400, detail=f"At most {MAX_PER_USER} saved filters")
        row = SavedFilter(user_id=current_user.id, name=name, query=query)
        db.add(row)
    else:
        row.query = query
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{filter_id}")
def delete_filter(filter_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(SavedFilter, filter_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Saved filter not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
