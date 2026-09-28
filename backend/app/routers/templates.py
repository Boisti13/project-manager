"""Task templates: save a task with its subtasks under a name, create it
again with one click. Shared by everyone; the one who saved it (or an admin)
can delete it."""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import access, activity, notify, schemas
from app.auth import get_current_user
from app.database import get_db
from app.models import Label, Task, TaskStatus, TaskTemplate, User

router = APIRouter()

MAX_TASKS = 500


def _node(task: Task) -> dict:
    return {
        "title": task.title,
        "description": task.description,
        "priority": task.priority or 0,
        "estimate_minutes": task.estimate_minutes,
        "label_ids": [label.id for label in task.labels],
        "subtasks": [_node(s) for s in sorted(task.subtasks, key=lambda s: (s.order or 0, s.id))],
    }


def _count(node: dict) -> int:
    return 1 + sum(_count(s) for s in node["subtasks"])


def _out(row: TaskTemplate) -> schemas.Template:
    tree = json.loads(row.data)
    return schemas.Template(
        id=row.id, name=row.name, created_by=row.created_by.username if row.created_by else None,
        created_by_id=row.created_by_id, created_at=row.created_at, task_count=_count(tree), tree=tree,
    )


@router.get("/", response_model=list[schemas.Template])
def list_templates(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [_out(r) for r in sorted(db.query(TaskTemplate), key=lambda r: r.name.lower())]


@router.post("/", response_model=schemas.Template)
def save_template(data: schemas.TemplateCreate, current_user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    name = " ".join(data.name.split())
    if not name:
        raise HTTPException(status_code=422, detail="Name is empty")
    if db.query(TaskTemplate).filter(func.lower(TaskTemplate.name) == name.lower()).first():
        raise HTTPException(status_code=409, detail="A template with this name already exists")
    tree = _node(access.require_task(db, current_user, data.task_id))
    if _count(tree) > MAX_TASKS:
        raise HTTPException(status_code=400, detail=f"At most {MAX_TASKS} tasks in a template")
    row = TaskTemplate(name=name, data=json.dumps(tree), created_by_id=current_user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.delete("/{template_id}")
def delete_template(template_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(TaskTemplate, template_id)
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    if row.created_by_id not in (None, current_user.id) and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only the one who saved it or an admin can delete it")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/{template_id}/use")
def use_template(template_id: int, data: schemas.TemplateUse, current_user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    """Creates the template's tasks (all as To Do) in one go; returns their ids,
    the top one first."""
    row = db.get(TaskTemplate, template_id)
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    tree = json.loads(row.data)

    project_id = data.project_id
    if data.parent_task_id is not None:
        parent = access.require_task(db, current_user, data.parent_task_id)
        if project_id is None:
            project_id = parent.project_id
    if project_id is not None:
        access.require_project(db, current_user, project_id, status=400)
    if data.assignee_id is not None and not db.get(User, data.assignee_id):
        raise HTTPException(status_code=400, detail="Assignee not found")
    access.check_assignee(db, data.assignee_id, project_id)

    labels = {label.id: label for label in db.query(Label)}  # deleted labels are skipped
    current = db.query(func.max(Task.order)).filter(
        Task.parent_task_id.is_(None) if data.parent_task_id is None else Task.parent_task_id == data.parent_task_id
    ).scalar()
    created = []

    def add(node, parent_id, order, top=False):
        title = (data.title or "").strip() if top else ""
        task = Task(
            title=title or node["title"], description=node.get("description"), status=TaskStatus.TODO,
            priority=node.get("priority") or 0, estimate_minutes=node.get("estimate_minutes"),
            deadline=data.deadline if top else None, project_id=project_id, parent_task_id=parent_id,
            assignee_id=data.assignee_id, order=order,
            labels=[labels[i] for i in node.get("label_ids", []) if i in labels],
        )
        db.add(task)
        db.flush()
        activity.created(db, task, current_user)
        created.append(task.id)
        for i, sub in enumerate(node.get("subtasks", [])):
            add(sub, task.id, i)
        return task

    top = add(tree, data.parent_task_id, (current + 1) if current is not None else 0, top=True)
    if data.assignee_id is not None:
        notify.assigned(db, top, current_user, count=len(created))
    db.commit()
    return {"created": len(created), "ids": created}
