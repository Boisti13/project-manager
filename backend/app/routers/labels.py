"""Labels: colored tags shared by everyone, put on tasks across projects.
Anyone logged in can create, rename, recolor and delete them."""
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import schemas
from app.auth import get_current_user
from app.database import get_db
from app.models import Label, User, task_labels
from app.routers.projects import PALETTE

router = APIRouter()


def next_label_color(db: Session) -> str:
    used = Counter(c for (c,) in db.query(Label.color))
    return min(PALETTE, key=lambda c: (used[c], PALETTE.index(c)))


def _check_name(db: Session, name: str, label_id=None) -> str:
    name = " ".join(name.split())
    if not name:
        raise HTTPException(status_code=400, detail="Label name is empty")
    q = db.query(Label).filter(func.lower(Label.name) == name.lower())
    if label_id is not None:
        q = q.filter(Label.id != label_id)
    if q.first():
        raise HTTPException(status_code=400, detail=f'A label "{name}" already exists')
    return name


def resolve(db: Session, label_ids) -> list:
    """Labels for the given ids; 400 if one doesn't exist."""
    ids = set(label_ids or [])
    labels = db.query(Label).filter(Label.id.in_(ids)).all() if ids else []
    if len(labels) != len(ids):
        raise HTTPException(status_code=400, detail="Label not found")
    return labels


@router.get("/", response_model=list[schemas.Label])
def list_labels(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    counts = dict(db.query(task_labels.c.label_id, func.count()).group_by(task_labels.c.label_id))
    labels = db.query(Label).order_by(func.lower(Label.name)).all()
    return [schemas.Label(id=l.id, name=l.name, color=l.color, task_count=counts.get(l.id, 0)) for l in labels]


@router.post("/", response_model=schemas.Label)
def create_label(data: schemas.LabelCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    label = Label(name=_check_name(db, data.name), color=data.color or next_label_color(db))
    db.add(label)
    db.commit()
    db.refresh(label)
    return schemas.Label(id=label.id, name=label.name, color=label.color, task_count=0)


@router.put("/{label_id}", response_model=schemas.Label)
def update_label(label_id: int, data: schemas.LabelUpdate, current_user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    label = db.get(Label, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    if data.name is not None:
        label.name = _check_name(db, data.name, label_id)
    if data.color is not None:
        label.color = data.color
    db.commit()
    count = db.query(task_labels).filter(task_labels.c.label_id == label_id).count()
    return schemas.Label(id=label.id, name=label.name, color=label.color, task_count=count)


@router.delete("/{label_id}")
def delete_label(label_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    label = db.get(Label, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    db.delete(label)  # task_labels rows go with it (ON DELETE CASCADE)
    db.commit()
    return {"ok": True}
