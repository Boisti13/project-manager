"""Read-only share links: GET /share/<token> without logging in. Shows a
project's categories and tasks (titles, descriptions, status, priority,
deadlines, estimates, labels) — no comments, history or people."""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Project, Task, TaskStatus

router = APIRouter()


class SharedLabel(BaseModel):
    name: str
    color: str


class SharedTask(BaseModel):
    id: int
    parent_task_id: Optional[int] = None
    project_id: Optional[int] = None  # the project or one of its categories; None for subtasks
    title: str
    description: Optional[str] = None
    status: TaskStatus
    priority: int = 0
    order: int = 0
    deadline: Optional[datetime] = None
    estimate_minutes: Optional[int] = None
    completed_at: Optional[datetime] = None
    labels: List[SharedLabel] = []


class SharedCategory(BaseModel):
    id: int
    name: str
    description: Optional[str] = None


class SharedProject(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    archived: bool = False
    categories: List[SharedCategory]
    tasks: List[SharedTask]


@router.get("/{token}", response_model=SharedProject)
def shared_project(token: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.share_token == token).first() if token else None
    if project is None:
        raise HTTPException(status_code=404, detail="This link doesn't work (anymore)")
    categories = db.query(Project).filter(Project.parent_id == project.id).order_by(Project.name, Project.id).all()
    project_ids = {project.id, *(c.id for c in categories)}
    tasks = db.query(Task).options(selectinload(Task.labels)).filter(Task.project_id.in_(project_ids)).all()
    # Subtasks come along, also those without a project of their own.
    seen = {t.id for t in tasks}
    frontier = list(seen)
    while frontier:
        children = db.query(Task).options(selectinload(Task.labels)).filter(Task.parent_task_id.in_(frontier)).all()
        children = [c for c in children if c.id not in seen]
        tasks += children
        seen.update(c.id for c in children)
        frontier = [c.id for c in children]
    return SharedProject(
        id=project.id, name=project.name, description=project.description, color=project.color,
        archived=project.archived_at is not None,
        categories=[SharedCategory(id=c.id, name=c.name, description=c.description) for c in categories],
        tasks=[
            SharedTask(
                id=t.id, parent_task_id=t.parent_task_id, project_id=t.project_id, title=t.title,
                description=t.description, status=t.status, priority=t.priority or 0, order=t.order or 0,
                deadline=t.deadline, estimate_minutes=t.estimate_minutes, completed_at=t.completed_at,
                labels=[SharedLabel(name=label.name, color=label.color) for label in t.labels],
            )
            for t in sorted(tasks, key=lambda t: (t.order or 0, t.id))
        ],
    )
