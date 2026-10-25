import uuid
from collections.abc import Callable
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Event, Match, TeamMember
from tests.factories import make_event, make_match, make_player, make_team, make_user


@pytest.fixture
def setup(session: Session) -> dict[str, Any]:
    """A user, two teams, a player on each, and a match between them."""
    user = make_user(session)
    home = make_team(session, user, "Huskies")
    away = make_team(session, user, "Rivals")
    return {
        "user": user,
        "home": home,
        "away": away,
        "home_player": make_player(session, home, number=4, name="Otto Opposite", position="OPP"),
        "away_player": make_player(session, away, number=13),  # no name, like many opponents
        "match": make_match(session, home, away, user),
    }


def test_saves_and_reads_back_a_match_with_its_taps(session: Session, setup: dict[str, Any]) -> None:
    match, user = setup["match"], setup["user"]
    lineup = {"players": [str(uuid.uuid4()) for _ in range(6)], "setterId": "x", "liberoId": None}
    make_event(
        session,
        match,
        user,
        seq=1,
        type="set_start",
        side=None,
        detail={"home": lineup, "away": lineup, "firstServe": "home"},
    )
    make_event(
        session,
        match,
        user,
        seq=2,
        type="attack",
        side="home",
        player_id=setup["home_player"].id,
        result="kill",
        detail={"row": "front"},
    )

    events = session.scalars(select(Event).where(Event.match_id == match.id).order_by(Event.seq)).all()
    assert [e.type for e in events] == ["set_start", "attack"]
    assert events[0].detail is not None and events[0].detail["firstServe"] == "home"
    assert events[1].result == "kill"
    assert events[1].received_at is not None  # filled in by the database


def test_a_tap_can_only_be_saved_once(session: Session, setup: dict[str, Any]) -> None:
    # This is what makes retried uploads safe: the phone's id is the primary key.
    event = make_event(session, setup["match"], setup["user"], seq=1)
    session.expunge(event)  # forget the Python copy, so it's the database that has to catch the duplicate
    with pytest.raises(IntegrityError):
        make_event(session, setup["match"], setup["user"], seq=2, id=event.id)


def test_seq_numbers_are_unique_within_a_match(session: Session, setup: dict[str, Any]) -> None:
    make_event(session, setup["match"], setup["user"], seq=1)
    other_match = make_match(session, setup["away"], setup["home"], setup["user"])
    make_event(session, other_match, setup["user"], seq=1)  # the same seq in another match is fine
    with pytest.raises(IntegrityError):
        make_event(session, setup["match"], setup["user"], seq=1)


BAD_EVENTS: list[tuple[str, dict[str, Any]]] = [
    ("unknown event type", {"type": "spike"}),
    # Short wrong values, so it's the home/away rule that rejects them rather than the column length.
    ("side that isn't home or away", {"side": "both"}),
    ("serving side that isn't home or away", {"serving_side": "none"}),
    ("rotation outside 1-6", {"home_rotation": 7}),
    ("set number of 0", {"set_number": 0}),
]


@pytest.mark.parametrize(("label", "fields"), BAD_EVENTS, ids=[label for label, _ in BAD_EVENTS])
def test_the_database_rejects_impossible_taps(
    session: Session, setup: dict[str, Any], label: str, fields: dict[str, Any]
) -> None:
    with pytest.raises(IntegrityError):
        make_event(session, setup["match"], setup["user"], **fields)


BAD_ROWS: list[tuple[str, Callable[[Session, dict[str, Any]], object]]] = [
    ("jersey number over 99", lambda s, d: make_player(s, d["home"], number=100)),
    ("unknown position", lambda s, d: make_player(s, d["home"], number=20, position="DS")),
    ("best of 4", lambda s, d: make_match(s, d["home"], d["away"], d["user"], best_of=4)),
    ("a team playing itself", lambda s, d: make_match(s, d["home"], d["home"], d["user"])),
]


@pytest.mark.parametrize(("label", "save"), BAD_ROWS, ids=[label for label, _ in BAD_ROWS])
def test_the_database_rejects_impossible_rows(
    session: Session, setup: dict[str, Any], label: str, save: Callable[[Session, dict[str, Any]], object]
) -> None:
    with pytest.raises(IntegrityError):
        save(session, setup)


def test_team_members_are_keepers_or_viewers(session: Session, setup: dict[str, Any]) -> None:
    viewer = make_user(session)
    session.add(TeamMember(team_id=setup["home"].id, user_id=setup["user"].id, role="keeper"))
    session.add(TeamMember(team_id=setup["home"].id, user_id=viewer.id, role="viewer"))
    session.flush()

    session.add(TeamMember(team_id=setup["away"].id, user_id=viewer.id, role="coach"))
    with pytest.raises(IntegrityError):
        session.flush()


def test_emails_are_unique(session: Session) -> None:
    make_user(session, "sam@example.com")
    with pytest.raises(IntegrityError):
        make_user(session, "sam@example.com")


def test_deleting_a_match_deletes_its_taps(session: Session, setup: dict[str, Any]) -> None:
    make_event(session, setup["match"], setup["user"], seq=1)
    session.delete(session.get(Match, setup["match"].id))
    session.flush()
    session.expire_all()
    assert session.scalars(select(Event)).all() == []
