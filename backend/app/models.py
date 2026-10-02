import uuid

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Table, UniqueConstraint, Uuid, Enum as SQLEnum, false, text,
    true,
)
from sqlalchemy.orm import relationship, backref
from app.database import Base
from app.timeutil import utcnow
import enum

def _new_uid() -> str:
    return str(uuid.uuid4())


def uid_column():
    """Stable, globally unique id, also for clients that create things
    offline and send the uid along (see docs/API.md)."""
    return Column(Uuid(as_uuid=False), nullable=False, unique=True, default=_new_uid,
                  server_default=text("gen_random_uuid()"))


class TaskStatus(str, enum.Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)
    # Interface language ("en", "de"); None: follow the browser.
    language = Column(String(5), nullable=True)
    # Secret in the user's calendar feed URL (routers/calendar.py); None until first shown.
    calendar_token = Column(String(64), nullable=True, unique=True)
    # Projects in none of the user's workspaces: shown in every workspace
    # (True) or only under "All" (routers/workspaces.py).
    workspace_unassigned_everywhere = Column(Boolean, nullable=False, default=True, server_default=true())

    tasks = relationship("Task", back_populates="assignee")

# Members of private projects (app/access.py). Only top-level projects have
# members; categories follow their project.
project_members = Table(
    "project_members",
    Base.metadata,
    Column("project_id", Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


# Labels on tasks (many-to-many).
task_labels = Table(
    "task_labels",
    Base.metadata,
    Column("task_id", Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("label_id", Integer, ForeignKey("labels.id", ondelete="CASCADE"), primary_key=True, index=True),
)


# Dependencies: task_id waits for blocked_by_id to be done.
task_dependencies = Table(
    "task_dependencies",
    Base.metadata,
    Column("task_id", Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("blocked_by_id", Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True, index=True),
)


class Label(Base):
    """A colored tag, shared by everyone (routers/labels.py)."""
    __tablename__ = "labels"

    id = Column(Integer, primary_key=True, index=True)
    uid = uid_column()
    name = Column(String(40), nullable=False, unique=True)
    color = Column(String(7), nullable=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    uid = uid_column()
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    # Hex color like "#2196f3". Categories usually leave it empty and use
    # their parent's color.
    color = Column(String(7), nullable=True)
    # Set for categories (sub-projects); only one level of nesting.
    parent_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    # Private: only members (and admins) see it, its categories and tasks.
    is_private = Column(Boolean, nullable=False, default=False, server_default=false())
    # Finished and put away (top-level projects only): hidden from lists and
    # choices, its tasks still found by search.
    archived_at = Column(DateTime, nullable=True)
    # Secret in the read-only share link (routers/shared.py); None: not shared.
    share_token = Column(String(64), nullable=True, unique=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    tasks = relationship("Task", back_populates="project")
    children = relationship("Project", passive_deletes=True)
    members = relationship("User", secondary=project_members, order_by="User.username")

    @property
    def member_ids(self):
        return [u.id for u in self.members]

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    uid = uid_column()
    title = Column(String, index=True)
    description = Column(Text, nullable=True)
    status = Column(SQLEnum(TaskStatus), default=TaskStatus.TODO)
    priority = Column(Integer, default=0)
    # Time estimate in minutes (None: not estimated).
    estimate_minutes = Column(Integer, nullable=True)
    order = Column(Integer, default=0)
    deadline = Column(DateTime, nullable=True)
    # When work starts (a date, like the deadline); with the deadline it's the
    # task's bar on the timeline. Optional.
    start_date = Column(DateTime, nullable=True)
    # Set when the task becomes done, cleared when it's reopened; drives the
    # "Completed" rows and archiving on the Tasks page.
    completed_at = Column(DateTime, nullable=True)
    # Repeating tasks (app/recurrence.py): unit day|week|month|year, every N.
    recurrence_unit = Column(String(10), nullable=True)
    recurrence_interval = Column(Integer, nullable=True)
    # Optional refinements (app/recurrence.py): weekdays "0,3" (weeks only,
    # 0 = Monday), a monthly mode, and "completion" to count from when it was
    # done instead of from the schedule.
    recurrence_days = Column("recurrence_weekdays", String(20), nullable=True)
    recurrence_monthly = Column(String(20), nullable=True)
    recurrence_from = Column(String(12), nullable=True)

    @property
    def recurrence_weekdays(self):
        return [int(d) for d in self.recurrence_days.split(",")] if self.recurrence_days else None

    @recurrence_weekdays.setter
    def recurrence_weekdays(self, days):
        self.recurrence_days = ",".join(str(d) for d in sorted(set(days))) if days else None

    # The occurrence created when this one was completed (prevents duplicates).
    recurrence_next_id = Column(Integer, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Foreign keys
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    parent_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    assignee_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    project = relationship("Project", back_populates="tasks")
    assignee = relationship("User", back_populates="tasks")
    subtasks = relationship(
        "Task",
        foreign_keys=[parent_task_id],
        backref=backref("parent_task", remote_side=[id]),
        cascade="all, delete-orphan",
        order_by="Task.order"
    )
    comments = relationship(
        "TaskComment",
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="TaskComment.id",
    )

    labels = relationship("Label", secondary=task_labels, order_by="Label.name", passive_deletes=True)
    # Tasks this one waits for (app/dependencies.py).
    blocked_by = relationship(
        "Task",
        secondary=task_dependencies,
        primaryjoin=lambda: Task.id == task_dependencies.c.task_id,
        secondaryjoin=lambda: Task.id == task_dependencies.c.blocked_by_id,
        order_by=lambda: Task.id,
        passive_deletes=True,
    )

    @property
    def blocked_by_ids(self):
        return [t.id for t in self.blocked_by]

    @property
    def label_ids(self):
        return [l.id for l in self.labels]

    activity = relationship(
        "TaskActivity",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="TaskActivity.id",
    )

    # Filled in by the task list endpoint; not a column.
    comment_count = 0


class TaskActivity(Base):
    """History of a task (app/activity.py): created, status/assignee/...
    changed. old_value/new_value are display text, not ids."""
    __tablename__ = "task_activity"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    kind = Column(String(20), nullable=False)
    old_value = Column(String(300), nullable=True)
    new_value = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    actor = relationship("User")


class TaskComment(Base):
    __tablename__ = "task_comments"

    id = Column(Integer, primary_key=True, index=True)
    uid = uid_column()
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # Shown when there's no author account: imported comments from another
    # installation keep their original author's name here.
    author_name = Column(String, nullable=True)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow)
    edited_at = Column(DateTime, nullable=True)

    task = relationship("Task", back_populates="comments")
    author = relationship("User")


class ApiToken(Base):
    """Personal API token (app/auth.py): for scripts and other apps. Only
    the SHA-256 hash is stored; the token is shown once when created."""
    __tablename__ = "api_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    token_hash = Column(String(64), nullable=False, unique=True)
    prefix = Column(String(12), nullable=False)  # "pm_ab12cd34", to recognise it in the list
    created_at = Column(DateTime, default=utcnow)
    last_used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)

    user = relationship("User")


class Deletion(Base):
    """Record of something deleted (app/tombstones.py), so clients that keep
    a copy (offline apps, sync scripts) learn about it:
    GET /api/v1/deletions?since=..."""
    __tablename__ = "deletions"

    id = Column(Integer, primary_key=True, index=True)
    entity = Column(String(20), nullable=False)  # task | comment | project | label
    entity_id = Column(Integer, nullable=False)
    uid = Column(Uuid(as_uuid=False), nullable=True)
    deleted_at = Column(DateTime, default=utcnow, index=True)
    deleted_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class SavedFilter(Base):
    """A named set of task-list filters (the URL query, e.g.
    "assignee=me&label=3&sort=deadline"), per user (routers/saved_filters.py)."""
    __tablename__ = "saved_filters"
    __table_args__ = (UniqueConstraint("user_id", "name", name="saved_filters_user_name_key"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(60), nullable=False)
    query = Column(String(2000), nullable=False)
    created_at = Column(DateTime, default=utcnow)


class TaskTemplate(Base):
    """A task with its subtasks, saved to be created again (routers/templates.py).
    Shared by everyone. data: JSON tree {title, description, priority,
    estimate_minutes, label_ids, subtasks: [...]}."""
    __tablename__ = "task_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    data = Column(Text, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    created_by = relationship("User")


class TaskPin(Base):
    """A task someone pinned to the top of their My day (routers/pins.py)."""
    __tablename__ = "task_pins"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True, index=True)
    created_at = Column(DateTime, default=utcnow)


class Workspace(Base):
    """A user's own group of projects, e.g. "Work" or "Private"; the app shows
    one at a time, or all (routers/workspaces.py)."""
    __tablename__ = "workspaces"
    __table_args__ = (UniqueConstraint("user_id", "name", name="workspaces_user_name_key"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(40), nullable=False)
    color = Column(String(7), nullable=True)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=utcnow)


class ProjectWorkspace(Base):
    """The workspace a top-level project is in -- per user, since everyone
    groups projects for themselves (a shared project can be "Work" for one
    and "Private" for another). Categories follow their project."""
    __tablename__ = "project_workspaces"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)


class AppSetting(Base):
    """Instance-wide settings as key/value strings (see routers/settings.py)."""
    __tablename__ = "app_settings"

    key = Column(String(64), primary_key=True)
    value = Column(String, nullable=False)


class Notification(Base):
    """Something that happened to a user's tasks: assigned to them, or a new
    comment on a task they're involved in. Deadlines are computed live."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(20), nullable=False)  # "assigned" | "comment"
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # Short text shown in the bell: a comment excerpt, or "and 4 more tasks".
    excerpt = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    read_at = Column(DateTime, nullable=True)

    task = relationship("Task")
    actor = relationship("User", foreign_keys=[actor_id])
