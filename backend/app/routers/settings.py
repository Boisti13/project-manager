"""Instance-wide settings. Anyone logged in can read them; admins change them."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.auth import get_current_user, get_current_admin_user
from app.database import get_db
from app.models import AppSetting, User

router = APIRouter()

# backup_keep is also read by scripts/backup-db.sh straight from the table.
# allow_registration: once an admin exists, self-registration is closed
# unless an admin turns it on (the very first account can always register).
DEFAULTS = {"archive_after_days": 30, "backup_keep": 3, "allow_registration": False}


def _parse(default, raw: str):
    if isinstance(default, bool):
        return raw.strip().lower() in ("1", "true", "yes", "on")
    return type(default)(raw)


def read_settings(db: Session) -> dict:
    values = dict(DEFAULTS)
    for row in db.query(AppSetting).filter(AppSetting.key.in_(DEFAULTS.keys())):
        values[row.key] = _parse(DEFAULTS[row.key], row.value)
    return values


@router.get("/", response_model=schemas.AppSettings)
def get_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return read_settings(db)


@router.put("/", response_model=schemas.AppSettings)
def update_settings(new: schemas.AppSettingsUpdate, current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    for key, value in new.model_dump(exclude_none=True).items():
        row = db.get(AppSetting, key)
        if row is None:
            db.add(AppSetting(key=key, value=str(value)))
        else:
            row.value = str(value)
    db.commit()
    return read_settings(db)
