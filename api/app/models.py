"""The server's database tables, written as Python classes (SQLAlchemy models).

Teams, players, matches, and events keep the ids the app made on the phone, so
the same row has the same id everywhere and an upload can never create a second
copy. The CHECK constraints are rules the database itself enforces, as a last
line of defense behind the app's own checks.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    MetaData,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Predictable names for indexes and constraints, so migrations can refer to them.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

EVENT_TYPES = (
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
)


def one_of(column: str, values: tuple[str, ...]) -> str:
    """SQL for "column is one of these values", e.g. side IN ('home', 'away')."""
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"{column} IN ({quoted})"


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    # Every datetime column stores the time zone, so times from phones in any zone line up.
    type_annotation_map = {datetime: DateTime(timezone=True)}


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    # Never the password itself: a scrambled version that can be checked but not reversed.
    password_hash: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)  # made by the app
    name: Mapped[str] = mapped_column(String(100))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class TeamMember(Base):
    """Who can see or record a team's matches: a stat keeper can record, a viewer can only look."""

    __tablename__ = "team_members"
    __table_args__ = (CheckConstraint(one_of("role", ("keeper", "viewer")), name="role"),)

    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String(10))


class Player(Base):
    __tablename__ = "players"
    __table_args__ = (
        CheckConstraint("number BETWEEN 0 AND 99", name="number"),
        CheckConstraint(one_of("position", ("OH", "OPP", "MB", "S", "L")), name="position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)  # made by the app
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100), default="")  # optional, as in the app
    number: Mapped[int] = mapped_column(SmallInteger)
    position: Mapped[str] = mapped_column(String(3))


class Match(Base):
    __tablename__ = "matches"
    __table_args__ = (
        CheckConstraint("best_of IN (3, 5)", name="best_of"),
        CheckConstraint("home_team_id <> away_team_id", name="two_teams"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)  # made by the app
    home_team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), index=True)
    away_team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), index=True)
    best_of: Mapped[int] = mapped_column(SmallInteger)
    created_at: Mapped[datetime]  # when the match was created on the phone
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))


class Event(Base):
    """One tap, with the same fields the app saves (see app/src/domain/types.ts).

    Fields that only some event types have (the player, the result) can be empty, and the
    type-specific extras (serve type, attack row, lineups, the undone action) go in `detail`.
    """

    __tablename__ = "events"
    __table_args__ = (
        # The same match can't have two taps with the same seq number.
        UniqueConstraint("match_id", "seq", name="uq_events_match_id_seq"),
        CheckConstraint(one_of("type", EVENT_TYPES), name="type"),
        CheckConstraint(f"side IS NULL OR {one_of('side', ('home', 'away'))}", name="side"),
        CheckConstraint(one_of("serving_side", ("home", "away")), name="serving_side"),
        CheckConstraint("home_rotation BETWEEN 1 AND 6 AND away_rotation BETWEEN 1 AND 6", name="rotations"),
        CheckConstraint("seq >= 1 AND set_number >= 1 AND rally_number >= 1", name="counters"),
    )

    # The id the phone made. Because it's the primary key, uploading the same tap twice
    # can't create a second row: that's what makes retried uploads safe.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    match_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matches.id", ondelete="CASCADE"))
    seq: Mapped[int]
    action_id: Mapped[uuid.UUID]
    created_at: Mapped[datetime]  # when the tap happened, by the phone's clock
    received_at: Mapped[datetime] = mapped_column(server_default=func.now())  # when it reached the server
    type: Mapped[str] = mapped_column(String(30))
    side: Mapped[str | None] = mapped_column(String(4))
    player_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("players.id"))
    result: Mapped[str | None] = mapped_column(String(20))  # pass ratings are stored as "0"-"3"
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    set_number: Mapped[int] = mapped_column(SmallInteger)
    rally_number: Mapped[int] = mapped_column(SmallInteger)
    serving_side: Mapped[str] = mapped_column(String(4))
    home_rotation: Mapped[int] = mapped_column(SmallInteger)
    away_rotation: Mapped[int] = mapped_column(SmallInteger)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
