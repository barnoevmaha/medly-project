"""Registration, login, and the current-user endpoint."""
from __future__ import annotations

import base64
import binascii
import re
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlmodel import Session

from app.config import settings
from app.db import get_session
from app.models.enums import Role
from app.models.user import User
from app.security import (
    client_ip,
    create_access_token,
    find_user_by_email,
    get_current_user,
    hash_password,
    normalize_email,
    verify_password,
)
from app.services import tokens
from app.services.ratelimit import SlidingWindowLimiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


# --------------------------------------------------------------------------
# Refresh cookie
#
# httpOnly, so script on the page — including injected script — cannot read
# it. Scoped to /api/auth, so it rides along only on the calls that use it,
# not on every request to the API.
# --------------------------------------------------------------------------

REFRESH_COOKIE = "medly_refresh"
REFRESH_COOKIE_PATH = "/api/auth"

# The cookie is sent cross-site in production (SameSite=None), so a page on
# any origin could make the browser POST to /refresh or /logout with it. A
# custom header cannot be added cross-origin without a CORS preflight, and the
# preflight only passes for MEDLY_CORS_ORIGINS — so requiring one limits these
# two endpoints to our own frontend.
CSRF_HEADER = "X-Medly-CSRF"


def _set_refresh_cookie(response: Response, raw: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        raw,
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite=settings.refresh_cookie_samesite,  # type: ignore[arg-type]
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite=settings.refresh_cookie_samesite,  # type: ignore[arg-type]
    )


def _require_csrf_header(x_medly_csrf: Optional[str] = Header(default=None)) -> None:
    if x_medly_csrf != "1":
        raise HTTPException(status_code=403, detail=f"Missing {CSRF_HEADER} header")


def _signed_in(session: Session, response: Response, user: User) -> "TokenResponse":
    """Start a new sign-in: a fresh refresh-token family and an access token."""
    _set_refresh_cookie(response, tokens.issue(session, user.id or 0))
    return TokenResponse(access_token=create_access_token(user.email, user.role.value))


# --------------------------------------------------------------------------
# Brute-force limits
# --------------------------------------------------------------------------

_ip_limiter = SlidingWindowLimiter(
    settings.auth_ip_rate_limit_per_minute, settings.auth_ip_rate_limit_per_hour
)
_email_limiter = SlidingWindowLimiter(
    settings.auth_email_rate_limit_per_minute, settings.auth_email_rate_limit_per_hour
)


def _enforce_rate_limit(request: Request, email: str) -> None:
    """429 once either this IP or this address has made too many attempts.

    Every attempt counts, successful or not. That keeps the check ahead of the
    password comparison — a blocked attempt never reaches bcrypt — and no real
    person signs in five times a minute.
    """
    for limiter, key in (
        (_ip_limiter, f"ip:{client_ip(request)}"),
        (_email_limiter, f"email:{email}"),
    ):
        verdict = limiter.check(key)
        if not verdict.allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    "Too many attempts. Try again in "
                    f"{verdict.retry_after_seconds} seconds."
                ),
                headers={"Retry-After": str(verdict.retry_after_seconds)},
            )


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    institution: Optional[str] = None
    year_of_study: Optional[int] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: Role
    institution: Optional[str] = None
    year_of_study: Optional[int] = None
    avatar_url: str = ""
    points: int = 0
    is_premium: bool = False
    show_on_leaderboard: bool = True


def _to_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id or 0,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        institution=user.institution,
        year_of_study=user.year_of_study,
        avatar_url=user.avatar_url or "",
        points=user.points or 0,
        is_premium=bool(user.is_premium),
        show_on_leaderboard=bool(user.show_on_leaderboard),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> TokenResponse:
    email = normalize_email(str(payload.email))
    _enforce_rate_limit(request, email)
    if find_user_by_email(session, email):
        raise HTTPException(status_code=400, detail="That email is already registered")
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = User(
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        institution=payload.institution,
        year_of_study=payload.year_of_study,
        role=Role.STUDENT,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return _signed_in(session, response, user)


@router.post("/login", response_model=TokenResponse)
def login(
    request: Request,
    response: Response,
    form: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
) -> TokenResponse:
    email = normalize_email(form.username)
    _enforce_rate_limit(request, email)
    user = find_user_by_email(session, email)
    if not user or not user.is_active or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _signed_in(session, response, user)


@router.post("/refresh", response_model=TokenResponse, dependencies=[Depends(_require_csrf_header)])
def refresh(request: Request, session: Session = Depends(get_session)):
    """Trade the refresh cookie for a new access token, rotating the cookie."""
    raw = request.cookies.get(REFRESH_COOKIE)
    try:
        if not raw:
            raise tokens.RefreshError("no cookie")
        user, new_raw = tokens.rotate(session, raw)
    except tokens.RefreshError:
        # A JSONResponse rather than HTTPException, so the dead cookie can be
        # cleared on the same response.
        failed = JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Session expired — please sign in again"},
        )
        _clear_refresh_cookie(failed)
        return failed

    response = JSONResponse(
        content=TokenResponse(
            access_token=create_access_token(user.email, user.role.value)
        ).model_dump()
    )
    _set_refresh_cookie(response, new_raw)
    return response


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_require_csrf_header)],
)
def logout(request: Request, response: Response, session: Session = Depends(get_session)) -> None:
    """End this device's sign-in. Works with an expired access token, too."""
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        tokens.revoke(session, raw)
    _clear_refresh_cookie(response)


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)) -> UserResponse:
    return _to_response(user)


# --------------------------------------------------------------------------
# Avatar validation
#
# This value is stored verbatim and rendered in an <img src> for every viewer
# of a leaderboard or a chat room, so it is validated tightly rather than
# loosely. Three checks, in the order that fails cheapest first.
# --------------------------------------------------------------------------

# Only the three formats the uploader produces. The previous check accepted
# any `data:image/` prefix, which included `data:image/svg+xml` — SVG is a
# document format with script and external-fetch capability, and there is no
# reason for an avatar to be one.
AVATAR_MIME_TYPES = ("image/png", "image/jpeg", "image/webp")

_AVATAR_PATTERN = re.compile(
    r"^data:(?P<mime>"
    + "|".join(re.escape(mime) for mime in AVATAR_MIME_TYPES)
    + r");base64,(?P<payload>[A-Za-z0-9+/]+={0,2})$"
)

# The frontend resizes to a 512px longest edge and re-encodes as JPEG at
# quality 0.85 before uploading (src/lib/image.ts). Measured at that size:
# a photograph lands around 80,000 characters, and uniform random noise —
# the pathological worst case for JPEG, past anything a camera produces —
# lands at 265,000. So 400,000 is right: comfortable for real input, still a
# real ceiling, and it leaves the client's own quality-stepping fallback room
# to work. Lowering it to hug the measurement would only reject unusual but
# legitimate images.
AVATAR_MAX_CHARS = 400_000

# First bytes that must match the declared type, so "declared PNG" and
# "actually PNG" cannot diverge.
_AVATAR_MAGIC = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/webp": (b"RIFF",),
}


def validate_avatar(raw: str) -> str:
    """Return the avatar to store, or raise 422.

    An empty string is valid and means "remove it" — the UI falls back to
    initials, so clearing must not require a separate endpoint.
    """
    value = raw.strip()
    if not value:
        return ""

    if len(value) > AVATAR_MAX_CHARS:
        raise HTTPException(status_code=422, detail="Image too large — use one under 300 KB")

    match = _AVATAR_PATTERN.match(value)
    if not match:
        raise HTTPException(
            status_code=422,
            detail="Avatar must be an uploaded PNG, JPEG or WebP image",
        )

    try:
        decoded = base64.b64decode(match.group("payload"), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="Avatar image could not be decoded") from None

    magic = _AVATAR_MAGIC[match.group("mime")]
    if not any(decoded.startswith(prefix) for prefix in magic):
        raise HTTPException(
            status_code=422,
            detail="Avatar image does not match its declared format",
        )

    return value


class UpdateProfileRequest(BaseModel):
    """Everything the Settings page is allowed to change about an account.

    Notably absent: `role`, `points` and `is_premium`. Those are earned or
    granted elsewhere, and a settings form is not the place to edit them — a
    client that sends them is ignored rather than obeyed.
    """

    full_name: Optional[str] = None
    institution: Optional[str] = None
    year_of_study: Optional[int] = None
    avatar_url: Optional[str] = None
    show_on_leaderboard: Optional[bool] = None


@router.patch("/me", response_model=UserResponse)
def update_me(
    payload: UpdateProfileRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> UserResponse:
    if payload.full_name is not None:
        name = payload.full_name.strip()
        if len(name) < 2:
            raise HTTPException(status_code=422, detail="Name must be at least 2 characters")
        user.full_name = name
    if payload.institution is not None:
        user.institution = payload.institution.strip() or None
    if payload.year_of_study is not None:
        if not 1 <= payload.year_of_study <= 10:
            raise HTTPException(status_code=422, detail="Year of study must be between 1 and 10")
        user.year_of_study = payload.year_of_study
    if payload.avatar_url is not None:
        user.avatar_url = validate_avatar(payload.avatar_url)
    if payload.show_on_leaderboard is not None:
        user.show_on_leaderboard = payload.show_on_leaderboard

    session.add(user)
    session.commit()
    session.refresh(user)
    return _to_response(user)


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: PasswordChangeRequest,
    response: Response,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    """Change the password.

    The current password is required even though the caller already holds a
    valid token — a stolen token should not be enough to lock the owner out.

    Every refresh token the account has is revoked, so any other device —
    including one an attacker signed in from — is out once its short-lived
    access token expires. This device gets a fresh sign-in.
    """
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="New password must be different")

    user.hashed_password = hash_password(payload.new_password)
    session.add(user)
    session.commit()
    tokens.revoke_all_for_user(session, user.id or 0)
    _set_refresh_cookie(response, tokens.issue(session, user.id or 0))
