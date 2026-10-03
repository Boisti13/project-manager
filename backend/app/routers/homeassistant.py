"""Settings for Home Assistant over MQTT (app/mqtt.py): the broker (admins)
and each user's opt-in. Polling instead needs nothing here: GET /summary."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import mqtt, schemas, summary
from app.auth import get_current_admin_user, get_current_user
from app.database import get_db
from app.models import User

router = APIRouter()

# API field -> setting
FIELDS = {"enabled": "mqtt_enabled", "host": "mqtt_host", "port": "mqtt_port", "username": "mqtt_username",
          "password": "mqtt_password", "tls": "mqtt_tls", "topic": "mqtt_topic",
          "discovery_prefix": "mqtt_discovery_prefix", "reminder_time": "mqtt_reminder_time", "app_url": "mqtt_app_url"}


def _out(cfg: dict) -> dict:
    out = {api: cfg[key] for api, key in FIELDS.items() if api != "password"}
    out["password_set"] = bool(cfg["mqtt_password"])
    return out


def _changes(data: schemas.MqttSettingsUpdate) -> dict:
    changes = {}
    for api, value in data.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        changes[FIELDS[api]] = value.strip() if isinstance(value, str) and api != "password" else value
    return changes


@router.get("/mqtt")
def get_mqtt(current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    """The broker settings (without the password) and how the connection is doing."""
    return {"settings": _out(mqtt.read_config(db)), "status": mqtt.bridge.status()}


@router.put("/mqtt")
def update_mqtt(data: schemas.MqttSettingsUpdate, current_user: User = Depends(get_current_admin_user),
                db: Session = Depends(get_db)):
    changes = _changes(data)
    cfg = {**mqtt.read_config(db), **changes}
    if cfg["mqtt_enabled"] and not cfg["mqtt_host"]:
        raise HTTPException(status_code=400, detail="Enter the broker address first")
    mqtt.write_config(db, changes)
    mqtt.bridge.reload()
    return {"settings": _out(mqtt.read_config(db)), "status": mqtt.bridge.status()}


@router.post("/mqtt/test")
def test_mqtt(data: schemas.MqttSettingsUpdate, current_user: User = Depends(get_current_admin_user),
              db: Session = Depends(get_db)):
    """Tries the saved settings, with the given fields in place of saved ones."""
    error = mqtt.test_connection({**mqtt.read_config(db), **_changes(data)})
    return {"ok": error is None, "error": error}


@router.get("/me", response_model=schemas.HomeAssistantMe)
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cfg = mqtt.read_config(db)
    return {"available": cfg["mqtt_enabled"], "enabled": current_user.mqtt_enabled,
            "workspace_id": current_user.mqtt_workspace_id,
            "topic": f"{cfg['mqtt_topic']}/{mqtt.slug(current_user.username)}"}


@router.put("/me", response_model=schemas.HomeAssistantMe)
def update_me(data: schemas.HomeAssistantMeUpdate, current_user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    try:
        summary.user_workspace(db, current_user, data.workspace_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Workspace not found")
    user = db.get(User, current_user.id)
    user.mqtt_enabled = data.enabled
    user.mqtt_workspace_id = data.workspace_id
    db.commit()
    mqtt.bridge.reload()
    return get_me(user, db)
