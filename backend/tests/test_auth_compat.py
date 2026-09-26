"""Credentials created by earlier versions (passlib + python-jose) must keep
working after the switch to bcrypt + PyJWT. The values below were produced
with passlib 1.7.4 / python-jose 3.3.0."""
import jwt
import pytest

from app.auth import get_password_hash, verify_password

PASSLIB_SHORT = "$2b$12$j8sr0joGj8lWYRV2Ed50K.gFcVxnH5Bn7J/pIcpYfdZI/O6QqSy0i"  # "Secret-pass-1"
PASSLIB_LONG = "$2b$12$H.7/cXTeXG4TqvHSMCScluuIicNBIiJ2t9GPFMPSMkhxko/4msaR6"   # "Ü" * 50 (100 bytes)
JOSE_TOKEN = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhbGljZSIsImV4cCI6NDEwMjQ0NDgwMH0."
              "0-WrazXd5O9HIZ08_NfpFZo-xNlvGIMZsokch06Q3eA")                    # sub=alice, key legacy-secret


def test_old_passlib_hashes_still_verify():
    assert verify_password("Secret-pass-1", PASSLIB_SHORT)
    assert not verify_password("secret-pass-1", PASSLIB_SHORT)
    # >72 bytes: passlib truncated; we must truncate the same way
    assert verify_password("Ü" * 50, PASSLIB_LONG)
    assert verify_password("Ü" * 36 + "anything after byte 72", PASSLIB_LONG)


def test_new_hashes_and_long_passwords():
    h = get_password_hash("Ü" * 50)
    assert h.startswith("$2b$") and verify_password("Ü" * 50, h)
    assert not verify_password("wrong", h)


def test_garbage_hash_is_rejected_not_an_error():
    assert verify_password("x", "not-a-bcrypt-hash") is False
    assert verify_password("x", "") is False


@pytest.mark.filterwarnings("ignore:The HMAC key")  # the old test token used a short key
def test_old_jose_token_decodes_with_pyjwt():
    assert jwt.decode(JOSE_TOKEN, "legacy-secret", algorithms=["HS256"])["sub"] == "alice"


def test_login_with_a_legacy_hash(client, admin):
    """An account whose hash came from passlib can log in through the API."""
    from app.database import SessionLocal
    from app.models import User

    s = SessionLocal()
    s.add(User(username="old", email="old@example.com", hashed_password=PASSLIB_SHORT, is_active=True, is_admin=False))
    s.commit()
    s.close()
    assert client.post("/api/auth/login", data={"username": "old", "password": "Secret-pass-1"}).status_code == 200
