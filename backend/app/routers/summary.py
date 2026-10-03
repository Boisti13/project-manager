"""GET /api/v1/summary: the current user's numbers and short task lists in
one call -- made for Home Assistant's REST sensor (docs/home-assistant.md),
with a personal API token."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app import summary
from app.auth import get_current_user
from app.database import get_db
from app.models import User

router = APIRouter()


def base_url(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("host", request.url.netloc)
    return f"{proto}://{host}"


@router.get("/")
def get_summary(request: Request, workspace: Optional[int] = Query(default=None),
                current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Unread notifications; overdue, due today and due in the next 3 days
    (open tasks that are yours or nobody's), with up to 20 tasks each; open
    tasks assigned to you; the latest notification. `workspace`: only that
    workspace of yours."""
    try:
        ws = summary.user_workspace(db, current_user, workspace)
    except ValueError:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return summary.build(db, current_user, ws, base_url=base_url(request))
