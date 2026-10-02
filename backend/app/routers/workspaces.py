"""Workspaces: each user's own groups of projects (e.g. "Work" and
"Private"), so the app can show one at a time. They're personal: a shared
project can be in a different workspace -- or none -- for each user, and
nobody else sees them. Which workspace is shown is chosen per device in the
app; projects in no workspace show in every workspace or only under "All"
(unassigned_everywhere, per user). Categories follow their project."""
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import access, schemas
from app.auth import get_current_user
from app.database import get_db
from app.models import Project, ProjectWorkspace, User, Workspace
from app.routers.projects import PALETTE

router = APIRouter()

MAX_PER_USER = 20


def _mine(db: Session, user: User):
    return db.query(Workspace).filter(Workspace.user_id == user.id)


def _get(db: Session, user: User, workspace_id: int) -> Workspace:
    ws = db.get(Workspace, workspace_id)
    if not ws or ws.user_id != user.id:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


def _name(db: Session, user: User, name: str, own_id=None) -> str:
    name = " ".join(name.split())
    if not name:
        raise HTTPException(status_code=422, detail="Name is empty")
    clash = _mine(db, user).filter(Workspace.name == name, Workspace.id != (own_id or 0)).first()
    if clash:
        raise HTTPException(status_code=400, detail=f"There is already a workspace “{name}”")
    return name


def _out(ws: Workspace, project_ids=()) -> dict:
    return {"id": ws.id, "name": ws.name, "color": ws.color, "position": ws.position, "project_ids": sorted(project_ids)}


@router.get("/", response_model=schemas.Workspaces)
def list_workspaces(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The user's workspaces in their order, each with its (visible, top-level) projects."""
    rows = _mine(db, current_user).order_by(Workspace.position, Workspace.id).all()
    visible = access.visible_project_ids(db, current_user)
    top_level = {pid for (pid,) in db.query(Project.id).filter(Project.parent_id.is_(None))}
    projects = defaultdict(list)
    for a in db.query(ProjectWorkspace).filter(ProjectWorkspace.user_id == current_user.id):
        if a.project_id in top_level and access.project_visible(visible, a.project_id):
            projects[a.workspace_id].append(a.project_id)
    return {
        "workspaces": [_out(ws, projects[ws.id]) for ws in rows],
        "unassigned_everywhere": current_user.workspace_unassigned_everywhere,
    }


@router.post("/", response_model=schemas.Workspace)
def create_workspace(data: schemas.WorkspaceCreate, current_user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    rows = _mine(db, current_user).all()
    if len(rows) >= MAX_PER_USER:
        raise HTTPException(status_code=400, detail=f"At most {MAX_PER_USER} workspaces")
    name = _name(db, current_user, data.name)
    used = {ws.color for ws in rows}
    color = data.color or next((c for c in PALETTE if c not in used), PALETTE[len(rows) % len(PALETTE)])
    ws = Workspace(user_id=current_user.id, name=name, color=color,
                   position=max((w.position for w in rows), default=-1) + 1)
    db.add(ws)
    db.commit()
    db.refresh(ws)
    return _out(ws)


@router.put("/order")
def reorder_workspaces(data: schemas.WorkspaceOrder, current_user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    """The new order: all of the user's workspace ids."""
    rows = {ws.id: ws for ws in _mine(db, current_user)}
    if sorted(data.ids) != sorted(rows):
        raise HTTPException(status_code=400, detail="The order must list each of your workspaces once")
    for pos, ws_id in enumerate(data.ids):
        rows[ws_id].position = pos
    db.commit()
    return {"ok": True}


@router.put("/settings")
def workspace_settings(data: schemas.WorkspaceSettings, current_user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    current_user.workspace_unassigned_everywhere = data.unassigned_everywhere
    db.commit()
    return {"ok": True}


@router.put("/projects/{project_id}")
def set_project_workspace(project_id: int, data: schemas.ProjectWorkspaceSet,
                          current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Puts a top-level project into one of the user's workspaces (or none) -- for this user only."""
    project = access.require_project(db, current_user, project_id)
    if project.parent_id is not None:
        raise HTTPException(status_code=400, detail="Categories are in their project's workspace")
    row = db.get(ProjectWorkspace, (current_user.id, project_id))
    if data.workspace_id is None:
        if row is not None:
            db.delete(row)
    else:
        _get(db, current_user, data.workspace_id)
        if row is None:
            db.add(ProjectWorkspace(user_id=current_user.id, project_id=project_id, workspace_id=data.workspace_id))
        else:
            row.workspace_id = data.workspace_id
    db.commit()
    return {"ok": True}


@router.put("/{workspace_id}", response_model=schemas.Workspace)
def update_workspace(workspace_id: int, data: schemas.WorkspaceUpdate,
                     current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = _get(db, current_user, workspace_id)
    if data.name is not None:
        ws.name = _name(db, current_user, data.name, own_id=ws.id)
    if data.color is not None:
        ws.color = data.color
    db.commit()
    db.refresh(ws)
    ids = [a.project_id for a in db.query(ProjectWorkspace).filter(ProjectWorkspace.workspace_id == ws.id)]
    return _out(ws, ids)


@router.delete("/{workspace_id}")
def delete_workspace(workspace_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Deletes the workspace; its projects stay, in no workspace."""
    db.delete(_get(db, current_user, workspace_id))
    db.commit()
    return {"ok": True}
