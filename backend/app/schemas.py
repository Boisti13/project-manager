from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
import uuid
from typing import Literal, Optional, List
from datetime import datetime
from app.models import TaskStatus

# User schemas
PASSWORD_MIN = 8

class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    # Rules apply to new accounts only; responses use UserBase as-is so
    # existing accounts never fail validation.
    username: str = Field(min_length=1, max_length=50, pattern=r"^\S+$")
    password: str = Field(min_length=PASSWORD_MIN, max_length=200)

class AdminUserCreate(UserCreate):
    is_admin: bool = False

class PasswordSet(BaseModel):
    password: str = Field(min_length=PASSWORD_MIN, max_length=200)

class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=PASSWORD_MIN, max_length=200)

class User(UserBase):
    id: int
    is_active: bool
    is_admin: bool
    created_at: datetime
    language: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class UserAdminUpdate(BaseModel):
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None

class ApiTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    expires_in_days: Optional[int] = Field(default=None, ge=1, le=3650)  # None: never

class ApiTokenInfo(BaseModel):
    id: int
    name: str
    prefix: str
    created_at: datetime
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class ApiTokenCreated(ApiTokenInfo):
    token: str  # shown once

class DeletionEntry(BaseModel):
    entity: Literal["task", "comment", "project", "label"]
    id: int
    uid: Optional[str] = None
    deleted_at: datetime

class Preferences(BaseModel):
    language: Optional[Literal["en", "de"]] = None  # None: follow the browser

class SavedFilterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    query: str = Field(max_length=2000)  # URL query of the task list, without "?"

class SavedFilter(SavedFilterCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)

class TemplateNode(BaseModel):
    title: str
    description: Optional[str] = None
    priority: int = 0
    estimate_minutes: Optional[int] = None
    label_ids: List[int] = []
    subtasks: List["TemplateNode"] = []

TemplateNode.model_rebuild()

class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    task_id: int  # saved with its subtasks

class Template(BaseModel):
    id: int
    name: str
    created_by: Optional[str] = None
    created_by_id: Optional[int] = None
    created_at: Optional[datetime] = None
    task_count: int
    tree: TemplateNode

class TemplateUse(BaseModel):
    """Where and how to create the tasks; the rest comes from the template."""
    title: Optional[str] = Field(default=None, max_length=500)  # instead of the template's own title
    project_id: Optional[int] = None
    parent_task_id: Optional[int] = None
    deadline: Optional[datetime] = None  # for the top task
    assignee_id: Optional[int] = None  # for all of them

class Token(BaseModel):
    access_token: str
    token_type: str

# Project schemas
HEX_COLOR = r"^#[0-9a-fA-F]{6}$"

class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = Field(default=None, pattern=HEX_COLOR)
    parent_id: Optional[int] = None

class ProjectCreate(ProjectBase):
    uid: Optional[uuid.UUID] = None  # client-chosen; sending it again returns the existing project
    is_private: bool = False
    member_ids: List[int] = []

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = Field(default=None, pattern=HEX_COLOR)
    parent_id: Optional[int] = None
    is_private: Optional[bool] = None
    member_ids: Optional[List[int]] = None
    archived: Optional[bool] = None  # top-level projects only

class Project(ProjectBase):
    id: int
    uid: str
    is_private: bool = False
    member_ids: List[int] = []
    archived_at: Optional[datetime] = None
    share_token: Optional[str] = None  # read-only link: /share/<token>
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# Labels
class LabelCreate(BaseModel):
    uid: Optional[uuid.UUID] = None
    name: str = Field(min_length=1, max_length=40)
    color: Optional[str] = Field(default=None, pattern=HEX_COLOR)

class LabelUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=40)
    color: Optional[str] = Field(default=None, pattern=HEX_COLOR)

class Label(BaseModel):
    id: int
    uid: str
    name: str
    color: str
    task_count: int = 0
    updated_at: Optional[datetime] = None

# Task schemas
ESTIMATE_MAX = 60 * 24 * 365  # minutes

RecurrenceUnit = Literal["day", "week", "month", "year"]
RecurrenceMonthly = Literal["day", "last_day", "last_workday", "first_workday", "weekday", "last_weekday"]
RecurrenceFrom = Literal["schedule", "completion"]


def _check_weekdays(days):
    if days is not None and any(d < 0 or d > 6 for d in days):
        raise ValueError("weekdays are 0 (Monday) to 6 (Sunday)")
    return days

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.TODO
    priority: int = 0
    estimate_minutes: Optional[int] = Field(default=None, ge=1, le=ESTIMATE_MAX)
    order: int = 0
    deadline: Optional[datetime] = None
    start_date: Optional[datetime] = None
    project_id: Optional[int] = None
    parent_task_id: Optional[int] = None
    assignee_id: Optional[int] = None
    recurrence_unit: Optional[RecurrenceUnit] = None
    recurrence_interval: Optional[int] = Field(default=None, ge=1, le=365)
    recurrence_weekdays: Optional[List[int]] = None  # weeks only; 0 = Monday
    recurrence_monthly: Optional[RecurrenceMonthly] = None  # months/years only
    recurrence_from: Optional[RecurrenceFrom] = None
    label_ids: List[int] = []
    blocked_by_ids: List[int] = []

    @field_validator("recurrence_weekdays")
    @classmethod
    def _weekdays(cls, v):
        return _check_weekdays(v)

class TaskCreate(TaskBase):
    # Client-chosen uid (offline apps): sending the same uid again returns
    # the existing task instead of creating a second one.
    uid: Optional[uuid.UUID] = None
    # Alternatives to project_id / parent_task_id for things known only by uid.
    project_uid: Optional[uuid.UUID] = None
    parent_task_uid: Optional[uuid.UUID] = None

BULK_MAX_TASKS = 500

class BulkTaskItem(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    status: Optional[TaskStatus] = None  # overrides the shared status (e.g. "[x]" lines)
    children: List["BulkTaskItem"] = []

    @field_validator("title")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("title is empty")
        return v

class BulkTaskCreate(BaseModel):
    """Several tasks at once, as a tree; the other fields apply to all of them."""
    items: List[BulkTaskItem] = Field(min_length=1)
    project_id: Optional[int] = None
    parent_task_id: Optional[int] = None
    status: TaskStatus = TaskStatus.TODO
    priority: int = 0
    deadline: Optional[datetime] = None
    assignee_id: Optional[int] = None
    label_ids: List[int] = []

BulkTaskItem.model_rebuild()

class ActivityEntry(BaseModel):
    id: int
    kind: str
    actor: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    created_at: datetime


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[int] = None
    estimate_minutes: Optional[int] = Field(default=None, ge=1, le=ESTIMATE_MAX)
    order: Optional[int] = None
    deadline: Optional[datetime] = None
    start_date: Optional[datetime] = None
    project_id: Optional[int] = None
    assignee_id: Optional[int] = None
    recurrence_unit: Optional[RecurrenceUnit] = None
    recurrence_interval: Optional[int] = Field(default=None, ge=1, le=365)
    recurrence_weekdays: Optional[List[int]] = None  # weeks only; 0 = Monday
    recurrence_monthly: Optional[RecurrenceMonthly] = None  # months/years only
    recurrence_from: Optional[RecurrenceFrom] = None
    label_ids: Optional[List[int]] = None
    blocked_by_ids: Optional[List[int]] = None

    @field_validator("recurrence_weekdays")
    @classmethod
    def _weekdays(cls, v):
        return _check_weekdays(v)
    # Optional compare-and-set for offline clients: the values the edit was
    # based on. If one of these fields has changed on the server since, the
    # update is refused with 409 and the current task (see docs/API.md).
    expected: Optional[dict] = None

class BulkTaskUpdateItem(TaskUpdate):
    id: int

class BulkTaskUpdate(BaseModel):
    """POST /tasks/bulk-update: per task, the fields to change."""
    updates: List[BulkTaskUpdateItem] = Field(min_length=1, max_length=BULK_MAX_TASKS)

class Task(TaskBase):
    id: int
    uid: str
    completed_at: Optional[datetime] = None
    comment_count: int = 0
    created_at: datetime
    updated_at: datetime
    subtasks: List["Task"] = []

    model_config = ConfigDict(from_attributes=True)

Task.model_rebuild()


# Instance settings
class AppSettings(BaseModel):
    archive_after_days: int = Field(ge=1, le=3650)
    backup_keep: int = Field(ge=1, le=100)
    backup_daily: bool
    allow_registration: bool

class AppSettingsUpdate(BaseModel):
    archive_after_days: Optional[int] = Field(default=None, ge=1, le=3650)
    backup_keep: Optional[int] = Field(default=None, ge=1, le=100)
    backup_daily: Optional[bool] = None
    allow_registration: Optional[bool] = None


# Comments
class CommentCreate(BaseModel):
    uid: Optional[uuid.UUID] = None
    body: str = Field(min_length=1, max_length=10000)

class Comment(BaseModel):
    id: int
    uid: str
    task_id: int
    author_id: Optional[int] = None
    author: Optional[str] = None
    body: str
    created_at: datetime
    edited_at: Optional[datetime] = None


# Sync (routers/sync.py)
class SyncTask(TaskBase):
    """A task as in /tasks/, but flat (no nested subtasks)."""
    id: int
    uid: str
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class SyncUser(BaseModel):
    id: int
    username: str
    is_active: bool

class SyncIds(BaseModel):
    """Everything the user can currently see: drop local copies of anything
    not listed (deleted, or no longer visible)."""
    tasks: List[int]
    projects: List[int]
    labels: List[int]

class SyncResponse(BaseModel):
    cursor: str  # pass as ?since= next time
    full: bool
    tasks: List[SyncTask]
    projects: List[Project]
    labels: List[Label]
    comments: List[Comment]
    users: List[SyncUser]
    deletions: List["DeletionEntry"]
    ids: SyncIds

SyncResponse.model_rebuild()
