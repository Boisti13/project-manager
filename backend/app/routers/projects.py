import secrets
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Project, Task, User
from app.timeutil import utcnow
from app import access, schemas, tombstones
from app.auth import get_current_user

router = APIRouter()

# Kept in sync with PROJECT_COLORS in frontend/src/projects.js.
PALETTE = [
    "#2196f3", "#4caf50", "#ff9800", "#9c27b0", "#e91e63", "#009688",
    "#f44336", "#3f51b5", "#795548", "#00bcd4", "#8bc34a", "#607d8b",
]


def next_color(db: Session) -> str:
    """Least-used palette color among top-level projects."""
    used = Counter(c for (c,) in db.query(Project.color).filter(Project.parent_id.is_(None)))
    return min(PALETTE, key=lambda c: (used[c], PALETTE.index(c)))


def validate_parent(db: Session, user: User, project_id, parent_id):
    """Categories are one level deep: the parent must be a top-level project."""
    if parent_id is None:
        return
    if parent_id == project_id:
        raise HTTPException(status_code=400, detail="A project can't be its own parent")
    parent = access.require_project(db, user, parent_id, status=400)
    if parent.parent_id is not None:
        raise HTTPException(status_code=400, detail="Categories can't have categories of their own")
    if project_id is not None and db.query(Project).filter(Project.parent_id == project_id).count():
        raise HTTPException(status_code=400, detail="This project has categories, so it can't become a category itself")


def apply_access(db: Session, project: Project, user: User, is_private, member_ids, creating=False):
    """Privacy and members, for top-level projects only. Whoever creates a
    private project is a member; non-admins who change one stay members, so
    they can't lock themselves out."""
    if project.parent_id is not None:
        if is_private or member_ids:
            raise HTTPException(status_code=400, detail="Categories follow their project's visibility; "
                                                        "make the project private instead")
        project.is_private = False
        project.members = []
        return
    before = (bool(project.is_private), {u.id for u in project.members})
    if is_private is not None:
        project.is_private = is_private
    if member_ids is not None:
        users = db.query(User).filter(User.id.in_(set(member_ids))).all() if member_ids else []
        if len(users) != len(set(member_ids)):
            raise HTTPException(status_code=400, detail="Unknown user in members")
        project.members = users
    if project.is_private and (creating or not user.is_admin) and user not in project.members:
        project.members = [*project.members, user]
    if not creating and before != (bool(project.is_private), {u.id for u in project.members}):
        # Who can see it changed: send the project and its tasks to syncing
        # clients again, so people who just got access receive them.
        project.updated_at = utcnow()
        for p in [project, *db.query(Project).filter(Project.parent_id == project.id)]:
            p.updated_at = utcnow()
            tombstones.touch_tasks(db, (tid for (tid,) in db.query(Task.id).filter(Task.project_id == p.id)))


@router.post("/", response_model=schemas.Project)
def create_project(project: schemas.ProjectCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if project.uid is not None:
        existing = db.query(Project).filter(Project.uid == str(project.uid)).first()
        if existing is not None:
            if not access.project_visible(access.visible_project_ids(db, current_user), existing.id):
                raise HTTPException(status_code=409, detail="This uid is already in use")
            return existing  # a retried create
    validate_parent(db, current_user, None, project.parent_id)
    db_project = Project(**project.model_dump(exclude={"is_private", "member_ids", "uid"}))
    if project.uid is not None:
        db_project.uid = str(project.uid)
    apply_access(db, db_project, current_user, project.is_private, project.member_ids, creating=True)
    if db_project.parent_id is None and not db_project.color:
        db_project.color = next_color(db)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@router.get("/", response_model=list[schemas.Project])
def list_projects(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    visible = access.visible_project_ids(db, current_user)
    return [p for p in db.query(Project).order_by(Project.name, Project.id) if access.project_visible(visible, p.id)]

@router.get("/{project_id}", response_model=schemas.Project)
def get_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return access.require_project(db, current_user, project_id)

@router.put("/{project_id}", response_model=schemas.Project)
def update_project(project_id: int, project: schemas.ProjectUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_project = access.require_project(db, current_user, project_id)

    data = project.model_dump(exclude_unset=True)
    is_private = data.pop("is_private", None)
    member_ids = data.pop("member_ids", None)
    archived = data.pop("archived", None)
    if archived is not None:
        if db_project.parent_id is not None:
            raise HTTPException(status_code=400, detail="Categories are archived with their project")
        if archived and db_project.archived_at is None:
            db_project.archived_at = utcnow()
        elif not archived:
            db_project.archived_at = None
    if "parent_id" in data:
        validate_parent(db, current_user, project_id, data["parent_id"])
    for key, value in data.items():
        setattr(db_project, key, value)
    apply_access(db, db_project, current_user, is_private, member_ids)
    if db_project.parent_id is None and not db_project.color:
        db_project.color = next_color(db)

    db.commit()
    db.refresh(db_project)
    return db_project

def _top_level(db: Session, user: User, project_id: int) -> Project:
    project = access.require_project(db, user, project_id)
    if project.parent_id is not None:
        raise HTTPException(status_code=400, detail="Share the whole project, not a category")
    return project


@router.post("/{project_id}/share", response_model=schemas.Project)
def share_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """A read-only link to the project (/share/<token>): anyone with it sees its
    tasks without logging in. Asking again keeps the same link."""
    project = _top_level(db, current_user, project_id)
    if not project.share_token:
        project.share_token = secrets.token_urlsafe(24)
        db.commit()
        db.refresh(project)
    return project


@router.delete("/{project_id}/share", response_model=schemas.Project)
def unshare_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Stops sharing: the link stops working (sharing again makes a new one)."""
    project = _top_level(db, current_user, project_id)
    project.share_token = None
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}")
def delete_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_project = access.require_project(db, current_user, project_id)

    # Categories go with it (ON DELETE CASCADE); their tasks, like the
    # project's own, lose the project reference (ON DELETE SET NULL).
    tombstones.project_deleted(db, db_project, current_user)
    db.delete(db_project)
    db.commit()
    return {"ok": True}
