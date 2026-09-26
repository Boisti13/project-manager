from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import Task, TaskActivity, TaskComment, TaskStatus, User
from app import access, activity, notify, recurrence, schemas
from app.timeutil import utcnow
from app.auth import get_current_user
from app.routers.labels import resolve as resolve_labels

router = APIRouter()


def normalize_recurrence(task: Task):
    """A unit without an interval means "every 1"; no unit means no repeat."""
    if task.recurrence_unit:
        task.recurrence_interval = task.recurrence_interval or 1
    else:
        task.recurrence_unit = None
        task.recurrence_interval = None


def record_spawn(db: Session, task: Task, actor: User):
    nxt = recurrence.spawn_next(db, task)
    if nxt is not None:
        activity.created(db, nxt, actor)
        activity.repeated(db, task, nxt, actor)


def sync_completed_at(task: Task):
    if task.status == TaskStatus.DONE:
        if task.completed_at is None:
            task.completed_at = utcnow()
    else:
        task.completed_at = None


@router.post("/", response_model=schemas.Task)
def create_task(task: schemas.TaskCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if task.parent_task_id is not None:
        access.require_task(db, current_user, task.parent_task_id)
    if task.project_id is not None:
        access.require_project(db, current_user, task.project_id, status=400)
    access.check_assignee(db, task.assignee_id, task.project_id)
    db_task = Task(**task.model_dump(exclude={"label_ids"}))
    db_task.labels = resolve_labels(db, task.label_ids)
    normalize_recurrence(db_task)
    sync_completed_at(db_task)
    db.add(db_task)
    db.flush()
    notify.assigned(db, db_task, current_user)
    activity.created(db, db_task, current_user)
    record_spawn(db, db_task, current_user)
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
        if not parent or not access.task_visible(db, current_user, parent):
            raise HTTPException(status_code=404, detail="Parent task not found")
        if project_id is None:
            project_id = parent.project_id
    if project_id is not None:
        access.require_project(db, current_user, project_id, status=400)
    if data.assignee_id is not None and not db.get(User, data.assignee_id):
        raise HTTPException(status_code=400, detail="Assignee not found")
    access.check_assignee(db, data.assignee_id, project_id)

    def next_order(parent_id):
        current = db.query(func.max(Task.order)).filter(
            Task.parent_task_id.is_(None) if parent_id is None else Task.parent_task_id == parent_id
        ).scalar()
        return (current + 1) if current is not None else 0

    created = []
    labels = resolve_labels(db, data.label_ids)

    def add(items, parent_id):
        order = next_order(parent_id)
        for item in items:
            task = Task(
                title=item.title.strip(), status=item.status or data.status, priority=data.priority,
                deadline=data.deadline, project_id=project_id, parent_task_id=parent_id,
                assignee_id=data.assignee_id, order=order, labels=list(labels),
            )
            sync_completed_at(task)
            db.add(task)
            db.flush()
            activity.created(db, task, current_user)
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

    tasks = access.filter_tasks(db, current_user, query.options(selectinload(Task.labels)).order_by(Task.order, Task.id).all())
    counts = dict(db.query(TaskComment.task_id, func.count(TaskComment.id)).group_by(TaskComment.task_id))
    for t in tasks:
        t.comment_count = counts.get(t.id, 0)
    return tasks

@router.get("/{task_id}", response_model=schemas.Task)
def get_task(task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return access.require_task(db, current_user, task_id)

@router.put("/{task_id}", response_model=schemas.Task)
def update_task(task_id: int, task_update: schemas.TaskUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_task = access.require_task(db, current_user, task_id)

    update_data = task_update.model_dump(exclude_unset=True)
    before = activity.snapshot(db_task)
    label_ids = update_data.pop("label_ids", None)
    if label_ids is not None:
        db_task.labels = resolve_labels(db, label_ids)
    previous_assignee = db_task.assignee_id
    previous_project = db_task.project_id
    if update_data.get("project_id") is not None:
        access.require_project(db, current_user, update_data["project_id"], status=400)
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
    if db_task.assignee_id != previous_assignee or db_task.project_id != previous_project:
        access.check_assignee(db, db_task.assignee_id, db_task.project_id)
    normalize_recurrence(db_task)
    sync_completed_at(db_task)
    if db_task.assignee_id != previous_assignee:
        notify.assigned(db, db_task, current_user)
    activity.changed(db, db_task, before, current_user)
    record_spawn(db, db_task, current_user)

    db.commit()
    db.refresh(db_task)
    return db_task

@router.get("/{task_id}/activity", response_model=list[schemas.ActivityEntry])
def task_activity(task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    access.require_task(db, current_user, task_id)
    rows = db.query(TaskActivity).filter(TaskActivity.task_id == task_id).order_by(TaskActivity.id)
    return [
        schemas.ActivityEntry(id=a.id, kind=a.kind, actor=a.actor.username if a.actor else None,
                              old_value=a.old_value, new_value=a.new_value, created_at=a.created_at)
        for a in rows
    ]

@router.delete("/{task_id}")
def delete_task(task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_task = access.require_task(db, current_user, task_id)

    db.delete(db_task)
    db.commit()
    return {"ok": True}
