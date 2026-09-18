# Deployment Guide

## LXC Setup on PVE .103 (192.168.100.x)

### Prerequisites
- LXC container with Ubuntu 22.04 or similar
- Docker and Docker Compose installed
- Git installed

### Installation Steps

1. **Clone the repository on the LXC**
```bash
git clone <repo-url> /opt/task-manager
cd /opt/task-manager
git checkout main
```

2. **Create environment file**
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with production values
```

3. **Create PostgreSQL data directory**
```bash
mkdir -p /data/postgres
chmod 755 /data/postgres
```

4. **Update docker-compose.yml for production**
- Change volume paths if needed
- Set proper environment variables
- Update PostgreSQL password in production

5. **Start services**
```bash
docker-compose up -d
```

6. **Verify services are running**
```bash
docker-compose ps
docker-compose logs -f
```

7. **Access the application**
- Frontend: `http://<lxc-ip>:3000`
- API: `http://<lxc-ip>:8000`
- API Docs: `http://<lxc-ip>:8000/docs`

### Database Migrations (Future)

When using Alembic for migrations:
```bash
# Inside backend container
docker-compose exec backend alembic upgrade head
```

### Updates

To update from git:
```bash
cd /opt/task-manager
git fetch origin
git pull origin main
docker-compose down
docker-compose up -d
```

### Troubleshooting

**Check logs:**
```bash
docker-compose logs backend
docker-compose logs frontend
docker-compose logs postgres
```

**Rebuild images:**
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

**Reset database:**
```bash
docker-compose down -v
docker volume rm task-manager_postgres_data
docker-compose up -d
```
