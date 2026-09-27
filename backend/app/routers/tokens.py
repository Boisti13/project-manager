"""Personal API tokens: list, create (the token is returned once), revoke.
Managing tokens needs a password login, not a token (auth.get_session_user)."""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.auth import get_session_user, new_api_token
from app.database import get_db
from app.models import ApiToken, User
from app.timeutil import utcnow

router = APIRouter()

MAX_TOKENS_PER_USER = 50


@router.get("/", response_model=list[schemas.ApiTokenInfo])
def list_tokens(current_user: User = Depends(get_session_user), db: Session = Depends(get_db)):
    return db.query(ApiToken).filter(ApiToken.user_id == current_user.id).order_by(ApiToken.id).all()


@router.post("/", response_model=schemas.ApiTokenCreated)
def create_token(data: schemas.ApiTokenCreate, current_user: User = Depends(get_session_user),
                 db: Session = Depends(get_db)):
    if db.query(ApiToken).filter(ApiToken.user_id == current_user.id).count() >= MAX_TOKENS_PER_USER:
        raise HTTPException(status_code=400, detail=f"At most {MAX_TOKENS_PER_USER} tokens per user")
    token, token_hash, prefix = new_api_token()
    row = ApiToken(
        user_id=current_user.id, name=" ".join(data.name.split()), token_hash=token_hash, prefix=prefix,
        expires_at=(utcnow() + timedelta(days=data.expires_in_days)) if data.expires_in_days else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return schemas.ApiTokenCreated(**schemas.ApiTokenInfo.model_validate(row).model_dump(), token=token)


@router.delete("/{token_id}")
def revoke_token(token_id: int, current_user: User = Depends(get_session_user), db: Session = Depends(get_db)):
    row = db.get(ApiToken, token_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Token not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
