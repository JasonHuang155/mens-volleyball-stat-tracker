"""Accounts: sign up, log in, and finding out who is making a request."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db import SessionDep
from app.models import User
from app.schemas import LoginOut, LoginRequest, SignupRequest, UserOut
from app.security import (
    create_access_token,
    hash_password,
    read_access_token,
    verify_against_nothing,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["accounts"])

# Reads the "Authorization: Bearer <token>" header. It also adds the Authorize button on /docs.
_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def current_user(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    """The logged-in user making this request. Routes that need a login ask for `user: CurrentUser`."""
    if credentials is None:
        raise _unauthorized("Log in first")
    user_id = read_access_token(credentials.credentials)
    user = session.get(User, user_id) if user_id else None
    if user is None:
        raise _unauthorized("Your login has expired or isn't valid. Log in again.")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def _login_response(user: User) -> LoginOut:
    token, expires_at = create_access_token(user.id)
    return LoginOut(access_token=token, expires_at=expires_at, user=UserOut(id=user.id, email=user.email))


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def sign_up(body: SignupRequest, session: SessionDep) -> LoginOut:
    """Make an account. You're logged in straight away."""
    user = User(email=body.email.lower(), password_hash=hash_password(body.password))
    session.add(user)
    try:
        session.commit()
    except IntegrityError as error:  # the email is already taken (the database enforces unique emails)
        session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="An account with that email already exists") from error
    return _login_response(user)


@router.post("/login")
def log_in(body: LoginRequest, session: SessionDep) -> LoginOut:
    user = session.scalar(select(User).where(User.email == body.email.lower()))
    if user is None:
        verify_against_nothing(body.password)
        raise _unauthorized("Wrong email or password")
    if not verify_password(body.password, user.password_hash):
        # The same message as an unknown email, so nobody can find out which emails have accounts.
        raise _unauthorized("Wrong email or password")
    return _login_response(user)


@router.get("/me")
def who_am_i(user: CurrentUser) -> UserOut:
    """The account you're logged in as."""
    return UserOut(id=user.id, email=user.email)
