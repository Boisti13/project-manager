from datetime import timedelta

from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LoginFailure, User
from app import schemas, two_factor
from app.auth import verify_password, get_password_hash, create_access_token, get_current_user, get_session_user
from app.routers.settings import read_settings
from app.timeutil import utcnow

router = APIRouter()

# Slowing down password guessing: after this many failed logins within
# LOCK_WINDOW, logins are refused until the window has passed -- per account
# and address (so someone elsewhere can't lock you out), and per address over
# all accounts.
LOCK_WINDOW = timedelta(minutes=15)
MAX_FAILURES_PER_ACCOUNT = 5
MAX_FAILURES_PER_ADDRESS = 20
# The login answers this (401) when the password is right but the account
# needs a code from the authenticator app; the app then asks for it.
TWO_FACTOR_REQUIRED = "Two-factor code required"
# Requests from these come through the local Nginx, which passes on the real address.
TRUSTED_PROXIES = {"127.0.0.1", "::1"}


def client_ip(request: Request) -> str:
    """The caller's address; behind the local Nginx, the one it passes on."""
    host = request.client.host if request.client else ""
    if host in TRUSTED_PROXIES:
        forwarded = request.headers.get("x-real-ip") or request.headers.get("x-forwarded-for", "").split(",")[0]
        host = forwarded.strip() or host
    return host[:64]


def _locked(db: Session, username: str, ip: str) -> bool:
    recent = db.query(LoginFailure).filter(LoginFailure.at >= utcnow() - LOCK_WINDOW)
    return (recent.filter(LoginFailure.username == username, LoginFailure.ip == ip).count() >= MAX_FAILURES_PER_ACCOUNT
            or recent.filter(LoginFailure.ip == ip).count() >= MAX_FAILURES_PER_ADDRESS)


def _failed(db: Session, username: str, ip: str, detail: str):
    db.query(LoginFailure).filter(LoginFailure.at < utcnow() - timedelta(days=1)).delete()
    db.add(LoginFailure(username=username, ip=ip))
    db.commit()
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail,
                        headers={"WWW-Authenticate": "Bearer"})


def check_second_factor(db: Session, user: User, code: str) -> bool:
    """A current authenticator code (each works once) or an unused recovery code."""
    step = two_factor.matching_step(user.totp_secret, code)
    if step is not None and (user.totp_last_step is None or step > user.totp_last_step):
        user.totp_last_step = step
        db.commit()
        return True
    rest = two_factor.use_recovery_code(user.totp_recovery, code)
    if rest is not None:
        user.totp_recovery = rest
        db.commit()
        return True
    return False


def registration_open(db: Session) -> bool:
    """The first account can always register (it becomes the admin); after
    that only while an admin has registration switched on."""
    return db.query(User).count() == 0 or read_settings(db)["allow_registration"]


def ensure_unique(db: Session, username: str, email: str):
    existing = db.query(User).filter((User.username == username) | (User.email == email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already registered")


@router.get("/registration")
def registration_status(db: Session = Depends(get_db)):
    """Public: lets the login page show or hide the Register tab."""
    return {"open": registration_open(db)}


@router.post("/register", response_model=schemas.User)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    if not registration_open(db):
        raise HTTPException(status_code=403, detail="Registration is closed. Ask an admin for an account.")
    ensure_unique(db, user.username, user.email)

    is_first_user = db.query(User).count() == 0

    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=get_password_hash(user.password),
        is_admin=is_first_user,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.post("/login", response_model=schemas.Token)
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), otp: str = Form(default=""),
          db: Session = Depends(get_db)):
    """Username and password; for accounts with two-factor login also `otp`:
    the code from the authenticator app or a recovery code (without it, the
    answer is 401 "Two-factor code required"). Repeated failures are refused
    for a while (429)."""
    ip = client_ip(request)
    name = form_data.username.strip().lower()[:150]
    if _locked(db, name, ip):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail="Too many failed logins. Wait a few minutes and try again.",
                            headers={"Retry-After": str(int(LOCK_WINDOW.total_seconds()))})
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        _failed(db, name, ip, "Incorrect username or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated")
    if user.two_factor:
        if not otp.strip():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=TWO_FACTOR_REQUIRED,
                                headers={"WWW-Authenticate": "Bearer"})
        if not check_second_factor(db, user, otp):
            _failed(db, name, ip, "Wrong two-factor code")
    db.query(LoginFailure).filter(LoginFailure.username == name, LoginFailure.ip == ip).delete()
    db.commit()
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=schemas.Me)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me/preferences", response_model=schemas.Me)
def update_preferences(data: schemas.Preferences, current_user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    user = db.get(User, current_user.id)
    user.language = data.language
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password")
def change_password(data: schemas.PasswordChange, current_user: User = Depends(get_session_user),
                    db: Session = Depends(get_db)):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is wrong")
    user = db.get(User, current_user.id)
    user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    return {"ok": True}


# ---- two-factor login --------------------------------------------------------
# Changing it needs a password login (not an API token), like the password.

@router.get("/2fa", response_model=schemas.TwoFactorStatus)
def two_factor_status(current_user: User = Depends(get_current_user)):
    return {"enabled": current_user.two_factor, "recovery_left": two_factor.recovery_left(current_user.totp_recovery)}


@router.post("/2fa/setup", response_model=schemas.TwoFactorSetup)
def two_factor_setup(current_user: User = Depends(get_session_user), db: Session = Depends(get_db)):
    """A new secret to add to the authenticator app; on once confirmed with /2fa/enable."""
    if current_user.two_factor:
        raise HTTPException(status_code=400, detail="Two-factor login is already on")
    user = db.get(User, current_user.id)
    user.totp_secret = two_factor.new_secret()
    db.commit()
    uri = two_factor.otpauth_uri(user.totp_secret, user.username)
    return {"secret": user.totp_secret, "uri": uri, "qr_svg": two_factor.qr_svg(uri)}


@router.post("/2fa/enable", response_model=schemas.RecoveryCodes)
def two_factor_enable(data: schemas.TwoFactorCode, current_user: User = Depends(get_session_user),
                      db: Session = Depends(get_db)):
    """Confirms the setup with a code from the app; answers the recovery codes (shown once)."""
    user = db.get(User, current_user.id)
    if user.two_factor or not user.totp_secret:
        raise HTTPException(status_code=400, detail="Start the setup first")
    step = two_factor.matching_step(user.totp_secret, data.code)
    if step is None:
        raise HTTPException(status_code=400, detail="That code doesn't match. Check the time on your phone and try the next one.")
    codes, stored = two_factor.new_recovery_codes()
    user.totp_enabled_at = utcnow()
    user.totp_last_step = step
    user.totp_recovery = stored
    db.commit()
    return {"recovery_codes": codes}


@router.post("/2fa/recovery-codes", response_model=schemas.RecoveryCodes)
def two_factor_new_codes(data: schemas.PasswordConfirm, current_user: User = Depends(get_session_user),
                         db: Session = Depends(get_db)):
    """New recovery codes (the old ones stop working)."""
    user = db.get(User, current_user.id)
    if not user.two_factor:
        raise HTTPException(status_code=400, detail="Two-factor login is off")
    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Password is wrong")
    codes, user.totp_recovery = two_factor.new_recovery_codes()
    db.commit()
    return {"recovery_codes": codes}


def clear_two_factor(user: User):
    user.totp_secret = None
    user.totp_enabled_at = None
    user.totp_last_step = None
    user.totp_recovery = None


@router.post("/2fa/disable")
def two_factor_disable(data: schemas.PasswordConfirm, current_user: User = Depends(get_session_user),
                       db: Session = Depends(get_db)):
    user = db.get(User, current_user.id)
    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Password is wrong")
    clear_two_factor(user)
    db.commit()
    return {"ok": True}
