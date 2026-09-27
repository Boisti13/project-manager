"""Deletion records and "something changed" bumps, so clients that keep a
copy of the data (offline apps, sync scripts) can follow along:
- every deleted task (with its subtasks and their comments), comment,
  project (with its categories) and label leaves a Deletion row;
- tasks whose representation changes as a side effect (a label or
  project they belong to is deleted, a task they wait for is deleted) get
  a fresh updated_at."""
from sqlalchemy.orm import Session

from app.models import Deletion, Project, Task, TaskComment, User, task_dependencies, task_labels
from app.timeutil import utcnow


def _record(db: Session, entity: str, obj, actor: User):
    db.add(Deletion(entity=entity, entity_id=obj.id, uid=obj.uid, deleted_by_id=actor.id if actor else None))


def touch_tasks(db: Session, ids) -> None:
    ids = set(ids)
    if ids:
        db.query(Task).filter(Task.id.in_(ids)).update({Task.updated_at: utcnow()}, synchronize_session=False)


def task_deleted(db: Session, task: Task, actor: User) -> None:
    """Call before deleting `task`: it goes with its subtasks and comments."""
    doomed, stack = [], [task]
    while stack:
        t = stack.pop()
        doomed.append(t)
        stack.extend(t.subtasks)
    ids = {t.id for t in doomed}
    for t in doomed:
        _record(db, "task", t, actor)
        for c in t.comments:
            _record(db, "comment", c, actor)
    # Tasks that waited for these, or whose next occurrence this was, change too.
    waiting = {tid for (tid,) in db.query(task_dependencies.c.task_id).filter(task_dependencies.c.blocked_by_id.in_(ids))}
    previous = {tid for (tid,) in db.query(Task.id).filter(Task.recurrence_next_id.in_(ids))}
    touch_tasks(db, (waiting | previous) - ids)


def comment_deleted(db: Session, comment: TaskComment, actor: User) -> None:
    _record(db, "comment", comment, actor)


def project_deleted(db: Session, project: Project, actor: User) -> None:
    """Call before deleting `project`: its categories go with it, their
    tasks lose the project."""
    doomed = [project, *db.query(Project).filter(Project.parent_id == project.id)]
    for p in doomed:
        _record(db, "project", p, actor)
    ids = [p.id for p in doomed]
    touch_tasks(db, (tid for (tid,) in db.query(Task.id).filter(Task.project_id.in_(ids))))


def label_deleted(db: Session, label, actor: User) -> None:
    _record(db, "label", label, actor)
    touch_tasks(db, (tid for (tid,) in db.query(task_labels.c.task_id).filter(task_labels.c.label_id == label.id)))
