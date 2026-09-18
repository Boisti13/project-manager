# Task Manager

A self-hosted task management application with support for hierarchical tasks (main tasks + subtasks), multiple users, projects, deadlines, and extended status tracking.

## Features

- **Hierarchical Tasks**: Main tasks with subtasks in a tree structure
- **Multi-User**: Support for up to 10 users with assignments
- **Projects**: Organize tasks across multiple projects
- **Extended Status**: Multiple task states (todo, in-progress, blocked, done, etc.)
- **Deadlines**: Track task deadlines
- **Task Ordering**: Custom task ordering
- **Edit & Delete**: Full task lifecycle management
- **Self-Hosted**: Runs on LXC container on Proxmox VE

## Tech Stack

- **Backend**: FastAPI (Python)
- **Frontend**: React
- **Database**: PostgreSQL
- **Deployment**: Docker + LXC

## Development Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
npm start
```

## Architecture

```
task-manager/
├── backend/           # FastAPI application
├── frontend/          # React application
├── docker-compose.yml # Local development
└── docs/             # Project documentation
```

## Branching Strategy

- `main` - Production-ready code
- `dev` - Development branch for integration
- Feature branches from `dev`

---

**Note**: Pull code from git to LXC, never push directly.
