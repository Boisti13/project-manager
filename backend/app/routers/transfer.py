"""Project export/import as JSON, for handing projects to another user or
installation. Users/assignees are not part of the file; import always
creates new projects (renaming on a name clash) and never merges.
"""
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.version import APP_VERSION
from app.models import Project, Task, TaskComment, TaskStatus, User
from app.routers.projects import next_color
from app.routers.tasks import sync_completed_at

router = APIRouter()

FORMAT = "project-manager/projects"
FORMAT_VERSION = 1


# ---- file format --------------------------------------------------------

class CommentData(BaseModel):
    author: Optional[str] = None
    body: str = Field(min_length=1, max_length=10000)
    created_at: Optional[datetime] = None


class TaskData(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.TODO
    priority: int = 0
    order: int = 0
    deadline: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    comments: List[CommentData] = []
    subtasks: List["TaskData"] = []


class CategoryData(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    tasks: List[TaskData] = []


class ProjectData(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    tasks: List[TaskData] = []
    categories: List[CategoryData] = []


class ExportFile(BaseModel):
    format: Literal["project-manager/projects"]
    version: int = Field(ge=1, le=FORMAT_VERSION)
    exported_at: Optional[datetime] = None
    app_version: Optional[str] = None
    projects: List[ProjectData] = []
    # Tasks without a project; only in "export everything".
    unassigned_tasks: List[TaskData] = []


TaskData.model_rebuild()


# ---- export ----------------------------------------------------------------

def _task_tree(task: Task, children: dict) -> dict:
    return {
        "title": task.title,
        "description": task.description,
        "status": task.status.value if task.status else "todo",
        "priority": task.priority or 0,
        "order": task.order or 0,
        "deadline": task.deadline.isoformat() if task.deadline else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "comments": [
            {
                "author": c.author.username if c.author else c.author_name,
                "body": c.body,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in task.comments
        ],
        "subtasks": [_task_tree(c, children) for c in children.get(task.id, [])],
    }


@router.get("/export")
def export_projects(
    project_id: List[int] = Query(default=[]),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Selected top-level projects (?project_id=1&project_id=2), or everything
    including tasks without a project when none are given."""
    all_projects = db.query(Project).order_by(Project.name, Project.id).all()
    tasks = db.query(Task).order_by(Task.order, Task.id).all()

    children, roots_by_project = {}, {}
    for t in tasks:
        if t.parent_task_id is not None:
            children.setdefault(t.parent_task_id, []).append(t)
        else:
            roots_by_project.setdefault(t.project_id, []).append(t)
    tree = lambda pid: [_task_tree(t, children) for t in roots_by_project.get(pid, [])]  # noqa: E731

    top = [p for p in all_projects if p.parent_id is None]
    if project_id:
        wanted = set(project_id)
        missing = wanted - {p.id for p in top}
        if missing:
            raise HTTPException(status_code=404, detail=f"No top-level project with id {sorted(missing)}")
        top = [p for p in top if p.id in wanted]

    projects = [
        {
            "name": p.name,
            "description": p.description,
            "color": p.color,
            "tasks": tree(p.id),
            "categories": [
                {"name": c.name, "description": c.description, "tasks": tree(c.id)}
                for c in all_projects if c.parent_id == p.id
            ],
        }
        for p in top
    ]
    return {
        "format": FORMAT,
        "version": FORMAT_VERSION,
        "exported_at": datetime.utcnow().isoformat(),
        "app_version": APP_VERSION,
        "projects": projects,
        "unassigned_tasks": [] if project_id else tree(None),
    }


# ---- import ----------------------------------------------------------------

def _free_name(db: Session, name: str) -> str:
    taken = {n for (n,) in db.query(Project.name).filter(Project.parent_id.is_(None))}
    if name not in taken:
        return name
    i = 2
    while f"{name} ({i})" in taken:
        i += 1
    return f"{name} ({i})"


@router.post("/import")
def import_projects(data: ExportFile, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    counts = {"projects": 0, "categories": 0, "tasks": 0, "comments": 0}
    renamed = []

    def add_tasks(items: List[TaskData], project_id, parent_id=None):
        for item in items:
            task = Task(
                title=item.title, description=item.description, status=item.status,
                priority=item.priority, order=item.order, deadline=item.deadline,
                completed_at=item.completed_at, project_id=project_id, parent_task_id=parent_id,
            )
            sync_completed_at(task)
            db.add(task)
            db.flush()
            counts["tasks"] += 1
            for c in item.comments:
                # Users differ between installations: keep the name as text.
                db.add(TaskComment(task_id=task.id, author_id=None, author_name=c.author,
                                   body=c.body, created_at=c.created_at or datetime.utcnow()))
                counts["comments"] += 1
            add_tasks(item.subtasks, project_id, task.id)

    for p in data.projects:
        name = _free_name(db, p.name)
        if name != p.name:
            renamed.append({"from": p.name, "to": name})
        project = Project(name=name, description=p.description, color=p.color or next_color(db))
        db.add(project)
        db.flush()
        counts["projects"] += 1
        add_tasks(p.tasks, project.id)
        for c in p.categories:
            cat = Project(name=c.name, description=c.description, parent_id=project.id)
            db.add(cat)
            db.flush()
            counts["categories"] += 1
            add_tasks(c.tasks, cat.id)
    add_tasks(data.unassigned_tasks, None)

    db.commit()
    return {**counts, "renamed": renamed}
