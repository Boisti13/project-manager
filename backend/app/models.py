from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Table, Enum as SQLEnum, false
from sqlalchemy.orm import relationship, backref
from app.database import Base
from app.timeutil import utcnow
import enum

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


class Label(Base):
    """A colored tag, shared by everyone (routers/labels.py)."""
    __tablename__ = "labels"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(40), nullable=False, unique=True)
    color = Column(String(7), nullable=False)
    created_at = Column(DateTime, default=utcnow)


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    # Hex color like "#2196f3". Categories usually leave it empty and use
    # their parent's color.
    color = Column(String(7), nullable=True)
    # Set for categories (sub-projects); only one level of nesting.
    parent_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    # Private: only members (and admins) see it, its categories and tasks.
    is_private = Column(Boolean, nullable=False, default=False, server_default=false())
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
    title = Column(String, index=True)
    description = Column(Text, nullable=True)
    status = Column(SQLEnum(TaskStatus), default=TaskStatus.TODO)
    priority = Column(Integer, default=0)
    order = Column(Integer, default=0)
    deadline = Column(DateTime, nullable=True)
    # Set when the task becomes done, cleared when it's reopened; drives the
    # "Completed" rows and archiving on the Tasks page.
    completed_at = Column(DateTime, nullable=True)
    # Repeating tasks (app/recurrence.py): unit day|week|month|year, every N.
    recurrence_unit = Column(String(10), nullable=True)
    recurrence_interval = Column(Integer, nullable=True)
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
