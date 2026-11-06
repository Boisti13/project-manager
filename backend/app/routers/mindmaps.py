"""Mind maps for brainstorming. Each map belongs to a project (or category)
and is visible to whoever sees that project. The map's title is its centre;
the ideas are a flat list of nodes, saved as a whole with every change (see
MindMap in models.py). An idea can be turned into a task: the node keeps
the task's uid (`task_uid`)."""
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import access, schemas, tombstones
from app.auth import get_current_user
from app.database import get_db
from app.models import MindMap, User

router = APIRouter()

MAX_NODES = 1000


def _nodes(row: MindMap) -> list:
    try:
        return json.loads(row.nodes or "[]")
    except ValueError:
        return []


def summary(row: MindMap) -> schemas.MindMapSummary:
    return schemas.MindMapSummary(
        id=row.id, uid=row.uid, project_id=row.project_id, title=row.title, node_count=len(_nodes(row)),
        created_by_id=row.created_by_id, created_at=row.created_at, updated_at=row.updated_at,
    )


def full(row: MindMap) -> schemas.MindMap:
    return schemas.MindMap(**summary(row).model_dump(), nodes=_nodes(row))


def check_nodes(nodes: list) -> str:
    """Valid tree (unique ids, parents exist, no loops) -> JSON to store."""
    if len(nodes) > MAX_NODES:
        raise HTTPException(status_code=400, detail=f"At most {MAX_NODES} ideas in a mind map")
    by_id = {}
    for n in nodes:
        if n.id in by_id:
            raise HTTPException(status_code=400, detail=f"Duplicate node id {n.id}")
        by_id[n.id] = n
    for n in nodes:
        if n.parent is not None and n.parent not in by_id:
            raise HTTPException(status_code=400, detail=f"Node {n.id} points at a missing parent")
    for n in nodes:
        seen, cur = set(), n
        while cur.parent is not None:
            if cur.id in seen:
                raise HTTPException(status_code=400, detail="The ideas form a loop")
            seen.add(cur.id)
            cur = by_id[cur.parent]
    out = []
    for n in nodes:
        d = n.model_dump(mode="json", exclude_defaults=True)
        d["id"] = n.id
        d.setdefault("text", "")
        if n.parent is not None:
            d.pop("side", None)  # only main branches have a side
        out.append(d)
    return json.dumps(out, ensure_ascii=False)


def require_map(db: Session, user: User, map_id: int) -> MindMap:
    row = db.get(MindMap, map_id)
    if not row or not access.project_visible(access.visible_project_ids(db, user), row.project_id):
        raise HTTPException(status_code=404, detail="Mind map not found")
    return row


@router.get("/", response_model=list[schemas.MindMapSummary])
def list_maps(
    project_id: Optional[int] = Query(default=None, description="Only this project's maps (not its categories')"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    visible = access.visible_project_ids(db, current_user)
    q = db.query(MindMap)
    if project_id is not None:
        q = q.filter(MindMap.project_id == project_id)
    rows = [r for r in q.order_by(MindMap.updated_at.desc(), MindMap.id) if access.project_visible(visible, r.project_id)]
    return [summary(r) for r in rows]


@router.post("/", response_model=schemas.MindMap)
def create_map(data: schemas.MindMapCreate, current_user: User = Depends(get_current_user),
               db: Session = Depends(get_db)):
    if data.uid is not None:
        existing = db.query(MindMap).filter(MindMap.uid == str(data.uid)).first()
        if existing:
            return full(require_map(db, current_user, existing.id))
    access.require_project(db, current_user, data.project_id, status=400)
    title = " ".join(data.title.split())
    if not title:
        raise HTTPException(status_code=422, detail="Title is empty")
    row = MindMap(project_id=data.project_id, title=title, nodes=check_nodes(data.nodes),
                  created_by_id=current_user.id)
    if data.uid is not None:
        row.uid = str(data.uid)
    db.add(row)
    db.commit()
    db.refresh(row)
    return full(row)


@router.get("/{map_id}", response_model=schemas.MindMap)
def get_map(map_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return full(require_map(db, current_user, map_id))


@router.put("/{map_id}", response_model=schemas.MindMap)
def update_map(map_id: int, data: schemas.MindMapUpdate, current_user: User = Depends(get_current_user),
               db: Session = Depends(get_db)):
    row = require_map(db, current_user, map_id)
    if data.project_id is not None and data.project_id != row.project_id:
        access.require_project(db, current_user, data.project_id, status=400)
        row.project_id = data.project_id
    if data.title is not None:
        title = " ".join(data.title.split())
        if not title:
            raise HTTPException(status_code=422, detail="Title is empty")
        row.title = title
    if data.nodes is not None:
        row.nodes = check_nodes(data.nodes)
    db.commit()
    db.refresh(row)
    return full(row)


@router.delete("/{map_id}")
def delete_map(map_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = require_map(db, current_user, map_id)
    tombstones.mindmap_deleted(db, row, current_user)
    db.delete(row)
    db.commit()
    return {"ok": True}
