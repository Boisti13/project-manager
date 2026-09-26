from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Project, Task, TaskComment, TaskStatus, User
from app import notify, recurrence, schemas
from app.timeutil import utcnow
from app.auth import get_current_user

router = APIRouter()


def normalize_recurrence(task: Task):
    """A unit without an interval means "every 1"; no unit means no repeat."""
    if task.recurrence_unit:
        task.recurrence_interval = task.recurrence_interval or 1
    else:
        task.recurrence_unit = None
        task.recurrence_interval = None


def sync_completed_at(task: Task):
    if task.status == TaskStatus.DONE:
        if task.completed_at is None:
            task.completed_at = utcnow()
    else:
        task.completed_at = None


@router.post("/", response_model=schemas.Task)
def create_task(task: schemas.TaskCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_task = Task(**task.model_dump())
    normalize_recurrence(db_task)
    sync_completed_at(db_task)
    db.add(db_task)
    db.flush()
    notify.assigned(db, db_task, current_user)
    recurrence.spawn_next(db, db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@router.post("/bulk")
def create_tasks_bulk(data: schemas.BulkTaskCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Creates a tree of tasks in one transaction: all of them, or none."""
    def count(items):
        return sum(1 + count(i.children) for i in items)

    total = count(data.items)
    if total > schemas.BULK_MAX_TASKS:
        raise HTTPException(status_code=400, detail=f"At most {schemas.BULK_MAX_TASKS} tasks at once (got {total})")

    project_id = data.project_id
    if data.parent_task_id is not None:
        parent = db.get(Task, data.parent_task_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent task not found")
        if project_id is None:
            project_id = parent.project_id
    if project_id is not None and not db.get(Project, project_id):
        raise HTTPException(status_code=400, detail="Project not found")
    if data.assignee_id is not None and not db.get(User, data.assignee_id):
        raise HTTPException(status_code=400, detail="Assignee not found")

    def next_order(parent_id):
        current = db.query(func.max(Task.order)).filter(
            Task.parent_task_id.is_(None) if parent_id is None else Task.parent_task_id == parent_id
        ).scalar()
        return (current + 1) if current is not None else 0

    created = []

    def add(items, parent_id):
        order = next_order(parent_id)
        for item in items:
            task = Task(
                title=item.title.strip(), status=item.status or data.status, priority=data.priority,
                deadline=data.deadline, project_id=project_id, parent_task_id=parent_id,
                assignee_id=data.assignee_id, order=order,
            )
            sync_completed_at(task)
            db.add(task)
            db.flush()
            created.append(task.id)
            order += 1
            if item.children:
                add(item.children, task.id)

    add(data.items, data.parent_task_id)
    if data.assignee_id is not None and created:
        # One notification for the whole batch, pointing at the first task.
        notify.assigned(db, db.get(Task, created[0]), current_user, count=len(created))
    db.commit()
    return {"created": len(created), "ids": created}


@router.get("/", response_model=list[schemas.Task])
def list_tasks(project_id: int = None, parent_id: int = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Task)

    if project_id:
        query = query.filter(Task.project_id == project_id)
    if parent_id:
        query = query.filter(Task.parent_task_id == parent_id)

    tasks = query.order_by(Task.order, Task.id).all()
    counts = dict(db.query(TaskComment.task_id, func.count(TaskComment.id)).group_by(TaskComment.task_id))
    for t in tasks:
        t.comment_count = counts.get(t.id, 0)
    return tasks

@router.get("/{task_id}", response_model=schemas.Task)
def get_task(task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@router.put("/{task_id}", response_model=schemas.Task)
def update_task(task_id: int, task_update: schemas.TaskUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data = task_update.model_dump(exclude_unset=True)
    previous_assignee = db_task.assignee_id
    previous_project = db_task.project_id
    if "project_id" in update_data and update_data["project_id"] is not None             and not db.get(Project, update_data["project_id"]):
        raise HTTPException(status_code=400, detail="Project not found")
    for key, value in update_data.items():
        setattr(db_task, key, value)
    if db_task.project_id != previous_project:
        # "Move to": subtasks that followed the old project (or had none)
        # come along; ones deliberately put elsewhere keep theirs.
        stack = list(db_task.subtasks)
        while stack:
            sub = stack.pop()
            if sub.project_id in (previous_project, None):
                sub.project_id = db_task.project_id
            stack.extend(sub.subtasks)
    normalize_recurrence(db_task)
    sync_completed_at(db_task)
    if db_task.assignee_id != previous_assignee:
        notify.assigned(db, db_task, current_user)
    recurrence.spawn_next(db, db_task)

    db.commit()
    db.refresh(db_task)
    return db_task

@router.delete("/{task_id}")
def delete_task(task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    db.delete(db_task)
    db.commit()
    return {"ok": True}
