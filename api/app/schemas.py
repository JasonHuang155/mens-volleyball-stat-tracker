"""The shapes of the JSON the API accepts and sends back (Pydantic models).

FastAPI checks every request against these: a missing field, a password that's too
short, or an email that isn't an email gets a 422 error before our code runs.
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Role = Literal["keeper", "viewer"]


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: str


class LoginOut(BaseModel):
    """What signing up or logging in returns: the token to send with every later request."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime
    user: UserOut


class MemberIn(BaseModel):
    email: EmailStr
    role: Role


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    role: Role
