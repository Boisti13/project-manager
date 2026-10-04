"""The web address this server is reached at (e.g. http://192.168.100.114),
learned from the requests it gets -- for links that leave the app, like the
task links Home Assistant shows (app/mqtt.py). It follows the server when its
address changes; an admin can still set one explicitly (mqtt_app_url).

Requests from the server itself (localhost) don't count. Stored as the
AppSetting "server_url", written only when it changes."""
from typing import Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import AppSetting

KEY = "server_url"
_last: Optional[str] = None  # what's stored, so most requests cost nothing


def _from_request(request) -> Optional[str]:
    host = request.headers.get("host", "").strip()
    name = host.rsplit(":", 1)[0].strip("[]") if not host.startswith("[") else host.split("]")[0].strip("[")
    if not host or name in ("localhost", "::1") or name.startswith("127."):
        return None
    proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
    return f"{proto}://{host}"


def note(request):
    """Remembers the address `request` came in on (called for every API request)."""
    global _last
    url = _from_request(request)
    if url is None or url == _last:
        return
    with SessionLocal() as db:
        row = db.get(AppSetting, KEY)
        if row is None:
            db.add(AppSetting(key=KEY, value=url))
        elif row.value != url:
            row.value = url
        db.commit()
    _last = url


def get(db: Session) -> str:
    """The address last seen, or "" before any request from outside."""
    row = db.get(AppSetting, KEY)
    return row.value if row else ""


def forget():
    """For tests: the next request writes again."""
    global _last
    _last = None
