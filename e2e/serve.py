"""The backend plus the production frontend build on one port, for the
browser tests (e2e/). In production nginx does this; here one process is
enough. Usage: python e2e/serve.py PORT (database settings from DB_* env)."""
import os
import sys
from pathlib import Path

import uvicorn

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
BUILD = Path(os.environ.get("PM_E2E_BUILD") or ROOT / "frontend" / "build")

sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from app.main import app  # noqa: E402

# The API's own "/" would hide the app's start page.
app.router.routes = [r for r in app.router.routes if getattr(r, "path", None) != "/"]
app.mount("/static", StaticFiles(directory=BUILD / "static"), name="static")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    f = BUILD / path
    return FileResponse(f if path and f.is_file() else BUILD / "index.html")


uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[1]), log_level="warning")
