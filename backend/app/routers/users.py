from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app import schemas
from app.auth import get_current_user, get_current_admin_user, get_password_hash
from app.routers.auth import ensure_unique

router = APIRouter()

@router.get("/", response_model=list[schemas.User])
def list_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(User).filter(User.is_active == True).all()

@router.post("/", response_model=schemas.User)
def create_user(data: schemas.AdminUserCreate, current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    """Admins add accounts (works whether or not self-registration is open)."""
    ensure_unique(db, data.username, data.email)
    user = User(username=data.username, email=data.email, is_admin=data.is_admin,
                hashed_password=get_password_hash(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}/password")
def set_password(user_id: int, data: schemas.PasswordSet, current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = get_password_hash(data.password)
    db.commit()
    return {"ok": True}


@router.get("/admin/all", response_model=list[schemas.User])
def list_all_users(current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    return db.query(User).order_by(User.id).all()

@router.get("/{user_id}", response_model=schemas.User)
def get_user(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.put("/{user_id}", response_model=schemas.User)
def update_user(
    user_id: int,
    update: schemas.UserAdminUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id and update.is_admin is False:
        raise HTTPException(status_code=400, detail="You can't remove your own admin privileges")
    if user.id == current_user.id and update.is_active is False:
        raise HTTPException(status_code=400, detail="You can't deactivate your own account")

    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)

    db.commit()
    db.refresh(user)
    return user
