"""The shapes of the JSON the API accepts and sends back (Pydantic models).

FastAPI checks every request against these: a missing field, a password that's too
short, or a rotation of 7 gets a 422 error before our code runs.

The JSON uses camelCase names (matchId, setNumber), the same as the app's TypeScript,
so the app can send its saved taps exactly as they are. The Python code uses
snake_case (match_id, set_number); Pydantic translates between the two.
"""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel

Role = Literal["keeper", "viewer"]
Side = Literal["home", "away"]
Position = Literal["OH", "OPP", "MB", "S", "L"]
EventType = Literal[
    "serve",
    "pass",
    "attack",
    "block",
    "dig",
    "assist",
    "ball_handling_error",
    "point",
    "set_start",
    "substitution",
    "undo",
]


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---- Accounts ----


class SignupRequest(ApiModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(ApiModel):
    email: EmailStr
    password: str


class UserOut(ApiModel):
    id: uuid.UUID
    email: str


class LoginOut(ApiModel):
    """What signing up or logging in returns: the token to send with every later request."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime
    user: UserOut


class MemberIn(ApiModel):
    email: EmailStr
    role: Role


class MemberOut(ApiModel):
    user_id: uuid.UUID
    email: str
    role: Role


# ---- Syncing: the same shapes the app saves (app/src/domain/types.ts) ----


class TeamIn(ApiModel):
    id: uuid.UUID
    name: str = Field(min_length=1, max_length=100)


class TeamOut(TeamIn):
    role: Role  # your role on this team


class PlayerIn(ApiModel):
    id: uuid.UUID
    team_id: uuid.UUID
    name: str = Field(default="", max_length=100)
    number: int = Field(ge=0, le=99)
    position: Position


class MatchIn(ApiModel):
    id: uuid.UUID
    home_team_id: uuid.UUID
    away_team_id: uuid.UUID
    best_of: Literal[3, 5]
    created_at: datetime


class EventIn(ApiModel):
    """One tap. Fields that only some kinds of tap have (the player, the result) can be left out."""

    id: uuid.UUID
    match_id: uuid.UUID
    seq: int = Field(ge=1)
    action_id: uuid.UUID
    created_at: datetime
    set_number: int = Field(ge=1)
    rally_number: int = Field(ge=1)
    serving_side: Side
    home_rotation: int = Field(ge=1, le=6)
    away_rotation: int = Field(ge=1, le=6)
    type: EventType
    side: Side | None = None
    player_id: uuid.UUID | None = None
    result: str | int | None = None  # pass ratings are numbers (0-3); other results are words ("kill")
    detail: dict[str, Any] | None = None


class UploadIn(ApiModel):
    """A batch of new or changed data from the app. Everything in it is saved together, or none of it is."""

    teams: list[TeamIn] = []
    players: list[PlayerIn] = []
    matches: list[MatchIn] = []
    events: list[EventIn] = Field(default=[], max_length=1000)


class UploadCounts(ApiModel):
    teams: int = 0
    players: int = 0
    matches: int = 0
    events: int = 0


class UploadOut(ApiModel):
    """How many items were new, and how many the server already had (from an earlier, retried upload)."""

    saved: UploadCounts
    already_had: UploadCounts


class DownloadOut(ApiModel):
    """Everything you can see: your teams with their rosters, and their matches (taps come per match)."""

    teams: list[TeamOut]
    players: list[PlayerIn]
    matches: list[MatchIn]
