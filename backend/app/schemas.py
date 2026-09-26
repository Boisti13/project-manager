from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
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

    model_config = ConfigDict(from_attributes=True)

class UserAdminUpdate(BaseModel):
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None

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
    is_private: bool = False
    member_ids: List[int] = []

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = Field(default=None, pattern=HEX_COLOR)
    parent_id: Optional[int] = None
    is_private: Optional[bool] = None
    member_ids: Optional[List[int]] = None

class Project(ProjectBase):
    id: int
    is_private: bool = False
    member_ids: List[int] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# Labels
class LabelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: Optional[str] = Field(default=None, pattern=HEX_COLOR)

class LabelUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=40)
    color: Optional[str] = Field(default=None, pattern=HEX_COLOR)

class Label(BaseModel):
    id: int
    name: str
    color: str
    task_count: int = 0

# Task schemas
RecurrenceUnit = Literal["day", "week", "month", "year"]

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.TODO
    priority: int = 0
    order: int = 0
    deadline: Optional[datetime] = None
    project_id: Optional[int] = None
    parent_task_id: Optional[int] = None
    assignee_id: Optional[int] = None
    recurrence_unit: Optional[RecurrenceUnit] = None
    recurrence_interval: Optional[int] = Field(default=None, ge=1, le=365)
    label_ids: List[int] = []

class TaskCreate(TaskBase):
    pass

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
    order: Optional[int] = None
    deadline: Optional[datetime] = None
    project_id: Optional[int] = None
    assignee_id: Optional[int] = None
    recurrence_unit: Optional[RecurrenceUnit] = None
    recurrence_interval: Optional[int] = Field(default=None, ge=1, le=365)
    label_ids: Optional[List[int]] = None

class Task(TaskBase):
    id: int
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
    body: str = Field(min_length=1, max_length=10000)

class Comment(BaseModel):
    id: int
    task_id: int
    author_id: Optional[int] = None
    author: Optional[str] = None
    body: str
    created_at: datetime
    edited_at: Optional[datetime] = None
