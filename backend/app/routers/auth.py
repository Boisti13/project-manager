from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app import schemas
from app.auth import verify_password, get_password_hash, create_access_token, get_current_user
from app.routers.settings import read_settings

router = APIRouter()


def registration_open(db: Session) -> bool:
    """The first account can always register (it becomes the admin); after
    that only while an admin has registration switched on."""
    return db.query(User).count() == 0 or read_settings(db)["allow_registration"]


def ensure_unique(db: Session, username: str, email: str):
    existing = db.query(User).filter((User.username == username) | (User.email == email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already registered")


@router.get("/registration")
def registration_status(db: Session = Depends(get_db)):
    """Public: lets the login page show or hide the Register tab."""
    return {"open": registration_open(db)}


@router.post("/register", response_model=schemas.User)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    if not registration_open(db):
        raise HTTPException(status_code=403, detail="Registration is closed. Ask an admin for an account.")
    ensure_unique(db, user.username, user.email)

    is_first_user = db.query(User).count() == 0

    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=get_password_hash(user.password),
        is_admin=is_first_user,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated")
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=schemas.User)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me/preferences", response_model=schemas.User)
def update_preferences(data: schemas.Preferences, current_user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    user = db.get(User, current_user.id)
    user.language = data.language
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password")
def change_password(data: schemas.PasswordChange, current_user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is wrong")
    user = db.get(User, current_user.id)
    user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    return {"ok": True}
