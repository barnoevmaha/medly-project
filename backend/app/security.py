"""Password hashing, JWT issuing, and the auth dependencies.

bcrypt and PyJWT are used directly rather than through passlib and python-jose.
passlib imports the stdlib `crypt` module, which was removed in Python 3.13, so
it cannot be installed on a current interpreter at all; python-jose is
effectively unmaintained. Both wrappers were thin, and dropping them removes
four transitive dependencies.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import hmac

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, func, select

from app.config import settings
from app.db import get_session
from app.models.enums import Role
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# bcrypt hashes at most 72 bytes and raises on anything longer. Truncating is
# what passlib did silently; doing it explicitly makes the limit visible.
_BCRYPT_MAX_BYTES = 72


def _encode(raw: str) -> bytes:
    return raw.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(_encode(raw), bcrypt.gensalt()).decode("utf-8")


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_encode(raw), hashed.encode("utf-8"))
    except ValueError:
        # Stored value is not a bcrypt hash — treat as a failed login, not a 500.
        return False


def normalize_email(raw: str) -> str:
    """The one spelling of an address this app stores and looks up.

    Lowercased whole, local part included. RFC 5321 allows a case-sensitive
    local part, but no mainstream provider uses one, and treating
    `Alex@x.com` and `alex@x.com` as two accounts is far more harmful — two
    registrations, and a login that fails for a capital letter.
    """
    return raw.strip().lower()


def find_user_by_email(session: Session, email: str) -> Optional[User]:
    """Case-insensitive, so rows stored before normalisation are still found."""
    return session.exec(
        select(User).where(func.lower(User.email) == normalize_email(email))
    ).first()


def create_access_token(subject: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": normalize_email(subject),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        email: Optional[str] = payload.get("sub")
        if email is None:
            raise credentials_error
    except jwt.PyJWTError:
        raise credentials_error

    user = find_user_by_email(session, email)
    if user is None or not user.is_active:
        raise credentials_error
    return user


PROXY_SECRET_HEADER = "x-medly-proxy-secret"
PROXY_CLIENT_HEADER = "x-medly-client-ip"


def client_ip(request: Request) -> str:
    """The address a request came from, as far as it can be trusted.

    `X-Forwarded-For` is a list each proxy appends to, and anything left of
    the last entry was written by the client — so taking the first entry, as
    a blanket "trust the header" does, lets anyone pick their own address and
    walk round a per-IP limit. Instead:

      1. A request through our own nginx carries the shared proxy secret and
         the browser's address as nginx saw it. Believed only with the secret.
      2. Otherwise, with a secret configured, the last X-Forwarded-For entry:
         the one the platform's own proxy added, which a client cannot forge.
      3. With no secret configured, the address uvicorn derived — unchanged
         behaviour for a deployment that has not set one up.
    """
    secret = settings.proxy_secret
    if secret:
        presented = request.headers.get(PROXY_SECRET_HEADER, "")
        vouched = request.headers.get(PROXY_CLIENT_HEADER, "").strip()
        if vouched and hmac.compare_digest(presented.encode(), secret.encode()):
            return vouched
        forwarded = request.headers.get("x-forwarded-for", "")
        nearest = forwarded.split(",")[-1].strip() if forwarded else ""
        if nearest:
            return nearest
    return request.client.host if request.client else "unknown"


def require_roles(*roles: Role):
    """Dependency factory restricting an endpoint to the given roles."""

    allowed = set(roles)

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of: {', '.join(r.value for r in allowed)}",
            )
        return user

    return dependency


