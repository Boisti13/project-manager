from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.config import settings

# Cost factor for new hashes; the test suite lowers it for speed.
BCRYPT_ROUNDS = 12
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days


def _pw_bytes(password: str) -> bytes:
    # bcrypt only uses the first 72 bytes. passlib (used before v1.15) cut
    # longer passwords off silently; bcrypt 5 raises instead, so truncate the
    # same way to keep existing long passwords working.
    return password.encode("utf-8")[:72]


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(_pw_bytes(plain_password), hashed_password.encode("ascii"))
    except (ValueError, TypeError, AttributeError):
        return False  # not a bcrypt hash


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(_pw_bytes(password), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("ascii")


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        username = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == username).first()
    # Deactivated accounts lose access immediately, even with a valid token.
    if user is None or not user.is_active:
        raise credentials_exception
    return user


def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return current_user
