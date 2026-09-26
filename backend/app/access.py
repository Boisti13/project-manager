"""Who can see what. Projects are visible to everyone unless they're private;
a private project (with its categories, tasks, comments and history) is
visible to its members and to admins. Tasks without a project are visible to
everyone. Subtasks are visible when their parent is.

Things that aren't visible answer 404, as if they didn't exist."""
from typing import Iterable, Optional, Set

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Project, Task, User, project_members


def visible_project_ids(db: Session, user: User) -> Optional[Set[int]]:
    """Ids of projects and categories `user` may see; None means all (admins)."""
    if user.is_admin:
        return None
    member_of = {pid for (pid,) in db.query(project_members.c.project_id).filter(project_members.c.user_id == user.id)}
    rows = db.query(Project.id, Project.parent_id, Project.is_private).all()
    top_ok = {pid for pid, parent, private in rows if parent is None and (not private or pid in member_of)}
    return {pid for pid, parent, _ in rows if (parent if parent is not None else pid) in top_ok}


def project_visible(visible: Optional[Set[int]], project_id) -> bool:
    return visible is None or project_id is None or project_id in visible


def filter_tasks(db: Session, user: User, tasks: Iterable[Task]) -> list:
    """The visible ones among `tasks` (all tasks, or at least whole subtrees)."""
    tasks = list(tasks)
    visible = visible_project_ids(db, user)
    if visible is None:
        return tasks
    by_id = {t.id: t for t in tasks}
    memo = {}

    def ok(t: Task) -> bool:
        if t.id not in memo:
            memo[t.id] = project_visible(visible, t.project_id) and (
                t.parent_task_id is None
                or ok(by_id[t.parent_task_id] if t.parent_task_id in by_id else db.get(Task, t.parent_task_id))
            )
        return memo[t.id]

    return [t for t in tasks if ok(t)]


def task_visible(db: Session, user: User, task: Task, visible=None) -> bool:
    if user.is_admin:
        return True
    visible = visible_project_ids(db, user) if visible is None else visible
    while task is not None:
        if not project_visible(visible, task.project_id):
            return False
        task = db.get(Task, task.parent_task_id) if task.parent_task_id is not None else None
    return True


def require_task(db: Session, user: User, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if not task or not task_visible(db, user, task):
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def require_project(db: Session, user: User, project_id: int, status: int = 404) -> Project:
    """The project, if `user` may see it; else 404 (400 when it's a reference
    in a request body, e.g. a task's project)."""
    project = db.get(Project, project_id)
    if not project or not project_visible(visible_project_ids(db, user), project.id):
        raise HTTPException(status_code=status, detail="Project not found")
    return project


def top_project(db: Session, project_id) -> Optional[Project]:
    project = db.get(Project, project_id) if project_id is not None else None
    if project is not None and project.parent_id is not None:
        project = db.get(Project, project.parent_id)
    return project


def user_can_see_project(db: Session, user_id: int, project_id) -> bool:
    user = db.get(User, user_id)
    return bool(user) and project_visible(visible_project_ids(db, user), project_id)


def check_assignee(db: Session, assignee_id, project_id):
    """A task in a private project can only be assigned to someone who can see it."""
    if assignee_id is None or project_id is None:
        return
    if not db.get(User, assignee_id):
        raise HTTPException(status_code=400, detail="Assignee not found")
    if not user_can_see_project(db, assignee_id, project_id):
        top = top_project(db, project_id)
        name = db.get(User, assignee_id).username
        raise HTTPException(status_code=400,
                            detail=f"{name} isn't a member of the private project {top.name if top else ''}".strip())
