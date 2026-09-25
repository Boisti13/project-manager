"""Instance-wide settings. Anyone logged in can read them; admins change them."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.auth import get_current_user, get_current_admin_user
from app.database import get_db
from app.models import AppSetting, User

router = APIRouter()

DEFAULTS = {"archive_after_days": 30}


def read_settings(db: Session) -> dict:
    values = dict(DEFAULTS)
    for row in db.query(AppSetting).filter(AppSetting.key.in_(DEFAULTS.keys())):
        values[row.key] = type(DEFAULTS[row.key])(row.value)
    return values


@router.get("/", response_model=schemas.AppSettings)
def get_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return read_settings(db)


@router.put("/", response_model=schemas.AppSettings)
def update_settings(new: schemas.AppSettings, current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    for key, value in new.model_dump().items():
        row = db.get(AppSetting, key)
        if row is None:
            db.add(AppSetting(key=key, value=str(value)))
        else:
            row.value = str(value)
    db.commit()
    return read_settings(db)
