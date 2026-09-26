"""Comments on tasks. Anyone logged in can read and write them; authors can
edit their own, authors and admins can delete."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.timeutil import utcnow
from app.auth import get_current_user
from app.database import get_db
from app.models import Task, TaskComment, User

router = APIRouter()


def to_schema(c: TaskComment) -> schemas.Comment:
    return schemas.Comment(
        id=c.id, task_id=c.task_id, author_id=c.author_id,
        author=c.author.username if c.author else c.author_name,
        body=c.body, created_at=c.created_at, edited_at=c.edited_at,
    )


def get_task_or_404(db: Session, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def get_comment_or_404(db: Session, comment_id: int) -> TaskComment:
    comment = db.get(TaskComment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    return comment


@router.get("/tasks/{task_id}/comments", response_model=list[schemas.Comment])
def list_comments(task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [to_schema(c) for c in get_task_or_404(db, task_id).comments]


@router.post("/tasks/{task_id}/comments", response_model=schemas.Comment)
def add_comment(task_id: int, data: schemas.CommentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_task_or_404(db, task_id)
    body = data.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comment is empty")
    comment = TaskComment(task_id=task_id, author_id=current_user.id, body=body)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return to_schema(comment)


@router.put("/comments/{comment_id}", response_model=schemas.Comment)
def edit_comment(comment_id: int, data: schemas.CommentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    comment = get_comment_or_404(db, comment_id)
    if comment.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own comments")
    body = data.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comment is empty")
    if body != comment.body:
        comment.body = body
        comment.edited_at = utcnow()
        db.commit()
        db.refresh(comment)
    return to_schema(comment)


@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    comment = get_comment_or_404(db, comment_id)
    if comment.author_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only the author or an admin can delete a comment")
    db.delete(comment)
    db.commit()
    return {"ok": True}


@router.get("/comments/search")
def search_comments(q: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Ids of tasks with a comment containing q (case-insensitive), for the task search."""
    q = q.strip()
    if not q:
        return []
    pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    rows = db.query(TaskComment.task_id).filter(TaskComment.body.ilike(pattern, escape="\\")).distinct()
    return [task_id for (task_id,) in rows]
