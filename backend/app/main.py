from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import users, tasks, projects, auth

# Schema is managed by Alembic -- run `python migrate.py` on deploy.

VERSION_FILE = Path(__file__).resolve().parent.parent.parent / "VERSION"
try:
    APP_VERSION = VERSION_FILE.read_text().strip()
except FileNotFoundError:
    APP_VERSION = "0.0.0"

app = FastAPI(title="Task Manager API", version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])

@app.get("/")
def read_root():
    return {"message": "Task Manager API"}

@app.get("/health")
@app.get("/api/health")
def health_check():
    return {"status": "ok", "version": APP_VERSION}
