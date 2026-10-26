"""Passwords and login tokens.

Passwords are never stored. We store a "hash": a scrambled version made with Argon2
that can check a password but can't be turned back into it.

A login token is a JWT: a small signed note saying "this is user X, valid until Y".
The app sends it with every request (like showing a wristband), and the server checks
the signature to know the note is real and unchanged.
"""

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.config import settings

_password_hash = PasswordHash.recommended()  # Argon2
TOKEN_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _password_hash.verify(password, password_hash)


# Checked against when someone logs in with an email that has no account, so a wrong
# email takes as long as a wrong password and the timing doesn't reveal which emails exist.
_UNKNOWN_USER_HASH = hash_password("no account has this password")


def verify_against_nothing(password: str) -> None:
    _password_hash.verify(password, _UNKNOWN_USER_HASH)


def create_access_token(user_id: uuid.UUID, now: datetime | None = None) -> tuple[str, datetime]:
    """A signed token for this user, and when it expires."""
    issued_at = now or datetime.now(UTC)
    expires_at = issued_at + timedelta(days=settings.token_lifetime_days)
    claims = {"sub": str(user_id), "iat": issued_at, "exp": expires_at}
    return jwt.encode(claims, settings.jwt_secret, algorithm=TOKEN_ALGORITHM), expires_at


def read_access_token(token: str) -> uuid.UUID | None:
    """The user id in a token, or None if the token is fake, changed, or expired."""
    try:
        claims = jwt.decode(
            token, settings.jwt_secret, algorithms=[TOKEN_ALGORITHM], options={"require": ["sub", "exp"]}
        )
        return uuid.UUID(claims["sub"])
    # Catches either error. (Python 3.14 allows listing them without brackets.)
    except jwt.InvalidTokenError, ValueError:
        return None
