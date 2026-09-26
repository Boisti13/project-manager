from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
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

    class Config:
        from_attributes = True

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
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = Field(default=None, pattern=HEX_COLOR)
    parent_id: Optional[int] = None

class Project(ProjectBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Task schemas
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

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[int] = None
    order: Optional[int] = None
    deadline: Optional[datetime] = None
    project_id: Optional[int] = None
    assignee_id: Optional[int] = None

class Task(TaskBase):
    id: int
    completed_at: Optional[datetime] = None
    comment_count: int = 0
    created_at: datetime
    updated_at: datetime
    subtasks: List["Task"] = []

    class Config:
        from_attributes = True

Task.model_rebuild()


# Instance settings
class AppSettings(BaseModel):
    archive_after_days: int = Field(ge=1, le=3650)
    backup_keep: int = Field(ge=1, le=100)
    allow_registration: bool

class AppSettingsUpdate(BaseModel):
    archive_after_days: Optional[int] = Field(default=None, ge=1, le=3650)
    backup_keep: Optional[int] = Field(default=None, ge=1, le=100)
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
