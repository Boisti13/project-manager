"""Pinned tasks: each user's own short list, shown at the top of My day."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import access
from app.auth import get_current_user
from app.database import get_db
from app.models import Task, TaskPin, User

router = APIRouter()

MAX_PINS = 100


@router.get("/", response_model=list[int])
def list_pins(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Ids of the pinned tasks the user can (still) see, oldest pin first."""
    pins = db.query(TaskPin).filter(TaskPin.user_id == current_user.id).order_by(TaskPin.created_at, TaskPin.task_id).all()
    tasks = {t.id: t for t in db.query(Task).filter(Task.id.in_([p.task_id for p in pins]))} if pins else {}
    visible = {t.id for t in access.filter_tasks(db, current_user, list(tasks.values()))}
    return [p.task_id for p in pins if p.task_id in visible]


@router.put("/{task_id}")
def pin(task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    access.require_task(db, current_user, task_id)
    if db.get(TaskPin, (current_user.id, task_id)) is None:
        if db.query(TaskPin).filter(TaskPin.user_id == current_user.id).count() >= MAX_PINS:
            raise HTTPException(status_code=400, detail=f"At most {MAX_PINS} pinned tasks")
        db.add(TaskPin(user_id=current_user.id, task_id=task_id))
        db.commit()
    return {"ok": True}


@router.delete("/{task_id}")
def unpin(task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pin = db.get(TaskPin, (current_user.id, task_id))
    if pin is not None:
        db.delete(pin)
        db.commit()
    return {"ok": True}
