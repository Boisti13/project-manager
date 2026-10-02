"""Two-factor login with an authenticator app (TOTP, RFC 6238: 6 digits,
30-second steps, SHA-1 -- what Google/Microsoft Authenticator, Aegis,
2FAS, 1Password, Bitwarden … expect) and one-time recovery codes for when
the phone is gone. Routes in routers/auth.py."""
import base64
import hashlib
import hmac
import json
import secrets
import struct
import time
from typing import Optional
from urllib.parse import quote

import segno

STEP = 30
DIGITS = 6
WINDOW = 1  # also accept the step before and after (clocks drift a little)
RECOVERY_CODES = 10
ISSUER = "Project Manager"


def new_secret() -> str:
    """160 random bits, base32 without padding (as authenticator apps show it)."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def code_at(secret: str, step: int, digits: int = DIGITS) -> str:
    key = base64.b32decode(secret.upper() + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 10 ** digits
    return str(number).zfill(digits)


def matching_step(secret: str, code: str, now: Optional[float] = None) -> Optional[int]:
    """The time step `code` belongs to (around now), or None."""
    code = "".join(code.split())
    if len(code) != DIGITS or not code.isdigit():
        return None
    current = int((time.time() if now is None else now) // STEP)
    for step in range(current - WINDOW, current + WINDOW + 1):
        if hmac.compare_digest(code_at(secret, step), code):
            return step
    return None


def otpauth_uri(secret: str, username: str) -> str:
    label = quote(f"{ISSUER}:{username}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(ISSUER)}&algorithm=SHA1&digits={DIGITS}&period={STEP}"


def qr_svg(uri: str) -> str:
    """The URI as a QR code (SVG) for scanning with the authenticator app."""
    return segno.make(uri, error="m").svg_inline(scale=5, border=2)


def _hash(code: str) -> str:
    return hashlib.sha256("".join(code.lower().split()).replace("-", "").encode("ascii", "ignore")).hexdigest()


def new_recovery_codes() -> tuple:
    """(codes to show once, like "k3x9-q2mf", JSON of their hashes to store)"""
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o, 1/l/i
    codes = ["".join(secrets.choice(alphabet) for _ in range(4)) + "-" + "".join(secrets.choice(alphabet) for _ in range(4))
             for _ in range(RECOVERY_CODES)]
    return codes, json.dumps([_hash(c) for c in codes])


def recovery_left(stored: Optional[str]) -> int:
    return len(json.loads(stored)) if stored else 0


def use_recovery_code(stored: Optional[str], code: str) -> Optional[str]:
    """If `code` is one of the stored ones: the stored JSON without it; else None."""
    hashes = json.loads(stored) if stored else []
    h = _hash(code)
    if h not in hashes:
        return None
    hashes.remove(h)
    return json.dumps(hashes)
