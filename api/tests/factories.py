"""Small helpers that save test rows with sensible defaults, so each test only spells out what matters to it."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import Event, Match, Player, Team, User


def make_user(session: Session, email: str | None = None) -> User:
    user = User(email=email or f"{uuid.uuid4().hex[:8]}@example.com", password_hash="not-a-real-hash")
    session.add(user)
    session.flush()  # sends the INSERT now, so database rules are checked right away
    return user


def make_team(session: Session, created_by: User, name: str = "Huskies") -> Team:
    team = Team(id=uuid.uuid4(), name=name, created_by=created_by.id)
    session.add(team)
    session.flush()
    return team


def make_player(session: Session, team: Team, number: int = 7, **fields: Any) -> Player:
    player = Player(id=uuid.uuid4(), team_id=team.id, number=number, position=fields.pop("position", "OH"), **fields)
    session.add(player)
    session.flush()
    return player


def make_match(session: Session, home: Team, away: Team, created_by: User, **fields: Any) -> Match:
    match = Match(
        id=uuid.uuid4(),
        home_team_id=home.id,
        away_team_id=away.id,
        best_of=fields.pop("best_of", 5),
        created_at=datetime.now(UTC),
        created_by=created_by.id,
        **fields,
    )
    session.add(match)
    session.flush()
    return match


def make_event(session: Session, match: Match, uploaded_by: User, seq: int = 1, **fields: Any) -> Event:
    values: dict[str, Any] = {
        "id": uuid.uuid4(),
        "action_id": uuid.uuid4(),
        "created_at": datetime.now(UTC),
        "type": "point",
        "side": "home",
        "set_number": 1,
        "rally_number": 1,
        "serving_side": "home",
        "home_rotation": 1,
        "away_rotation": 1,
    }
    values.update(fields)
    event = Event(match_id=match.id, seq=seq, uploaded_by=uploaded_by.id, **values)
    session.add(event)
    session.flush()
    return event
