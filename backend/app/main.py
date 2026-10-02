from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import (
    users, tasks, projects, auth, system, settings, transfer, comments, notifications, labels, tokens, deletions, sync,
    calendar, saved_filters, templates, shared, pins, workspaces,
)
from app.version import APP_VERSION

# Schema is managed by Alembic -- run `python migrate.py` on deploy.

API_DESCRIPTION = """
REST API of Project Manager. **Stable under `/api/v1`** -- clients should use
that prefix; the unversioned `/api/...` paths are the same endpoints for the
bundled web app and may change with it.

**Authentication**: `Authorization: Bearer <token>`, where the token is either
a personal API token (`pm_...`, created under Settings -> API tokens) or the
`access_token` from `POST /api/v1/auth/login` (form fields `username`,
`password`). Everything a user can see and do in the app, a token for that
user can too -- except managing tokens and changing the password.

See `docs/API.md` in the repository for examples.
"""

app = FastAPI(
    title="Project Manager API",
    version=APP_VERSION,
    description=API_DESCRIPTION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROUTES = [
    (auth.router, "/auth", "auth"),
    (tokens.router, "/auth/tokens", "api tokens"),
    (users.router, "/users", "users"),
    (tasks.router, "/tasks", "tasks"),
    (projects.router, "/projects", "projects"),
    (labels.router, "/labels", "labels"),
    (comments.router, "", "comments"),
    (notifications.router, "/notifications", "notifications"),
    (settings.router, "/settings", "settings"),
    (transfer.router, "/transfer", "export / import"),
    (calendar.router, "/calendar", "calendar feed"),
    (saved_filters.router, "/saved-filters", "saved filters"),
    (templates.router, "/templates", "task templates"),
    (shared.router, "/share", "share links"),
    (pins.router, "/pins", "pinned tasks"),
    (workspaces.router, "/workspaces", "workspaces"),
    (sync.router, "/sync", "sync"),
    (deletions.router, "/deletions", "sync"),
    (system.router, "/system", "system"),
]
for router, path, tag in ROUTES:
    app.include_router(router, prefix="/api/v1" + path, tags=[tag])
    app.include_router(router, prefix="/api" + path, tags=[tag], include_in_schema=False)

@app.get("/")
def read_root():
    return {"message": "Project Manager API"}

@app.get("/health", include_in_schema=False)
@app.get("/api/health", include_in_schema=False)
@app.get("/api/v1/health", tags=["system"])
def health_check():
    return {"status": "ok", "version": APP_VERSION}
