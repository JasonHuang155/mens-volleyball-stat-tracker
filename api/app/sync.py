"""Uploading from the app and downloading to it.

Upload is safe to retry: every item keeps the id the phone gave it, so sending the
same batch again finds everything already there and changes nothing.
"""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.db import SessionDep
from app.models import Event, Match, Player, Team, TeamMember, User
from app.permissions import require_match_access, require_member
from app.schemas import (
    DownloadOut,
    EventIn,
    MatchIn,
    PlayerIn,
    TeamOut,
    UploadCounts,
    UploadIn,
    UploadOut,
)

router = APIRouter(tags=["sync"])

# When the database refuses a batch, a plain explanation for the problem, by the rule that refused it.
_CONSTRAINT_MESSAGES = {
    "uq_events_match_id_seq": "Another device has already recorded taps for this match. "
    "Only one device can record a match.",
    "fk_events_player_id_players": "A tap names a player the server doesn't have. Upload the roster first.",
    "fk_players_team_id_teams": "A player belongs to a team the server doesn't have. Upload the team first.",
}


@router.post("/sync/upload")
def upload(body: UploadIn, user: CurrentUser, session: SessionDep) -> UploadOut:
    """Save a batch of teams, players, matches, and taps from the app. Everything is saved together, or nothing is."""
    saved, already_had = UploadCounts(), UploadCounts()
    try:
        _save_teams(session, body, user, saved, already_had)
        _save_players(session, body, user, saved, already_had)
        _save_matches(session, body, user, saved, already_had)
        _save_events(session, body, user, saved, already_had)
        session.commit()
    except IntegrityError as error:
        session.rollback()
        message = next((m for name, m in _CONSTRAINT_MESSAGES.items() if name in str(error.orig)), None)
        conflict = "uq_events_match_id_seq" in str(error.orig)
        raise HTTPException(
            status.HTTP_409_CONFLICT if conflict else status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=message or "Something in this upload breaks the server's rules",
        ) from error
    except HTTPException:
        session.rollback()
        raise
    return UploadOut(saved=saved, already_had=already_had)


def _save_teams(session: Session, body: UploadIn, user: User, saved: UploadCounts, already_had: UploadCounts) -> None:
    for team in body.teams:
        existing = session.get(Team, team.id)
        if existing is None:
            # A brand-new team: whoever uploads it becomes its first stat keeper.
            session.add(Team(id=team.id, name=team.name, created_by=user.id))
            session.add(TeamMember(team_id=team.id, user_id=user.id, role="keeper"))
            saved.teams += 1
        else:
            require_member(session, team.id, user, keeper=True)
            existing.name = team.name  # the name may have been edited on the phone
            already_had.teams += 1
    session.flush()


def _save_players(session: Session, body: UploadIn, user: User, saved: UploadCounts, already_had: UploadCounts) -> None:
    for player in body.players:
        require_member(session, player.team_id, user, keeper=True)
        existing = session.get(Player, player.id)
        if existing is None:
            session.add(Player(**player.model_dump()))
            saved.players += 1
        elif existing.team_id != player.team_id:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="A player can't move to a different team")
        else:
            existing.name, existing.number, existing.position = player.name, player.number, player.position
            already_had.players += 1
    session.flush()


def _save_matches(session: Session, body: UploadIn, user: User, saved: UploadCounts, already_had: UploadCounts) -> None:
    for match in body.matches:
        if match.home_team_id == match.away_team_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="A match needs two different teams")
        for team_id in (match.home_team_id, match.away_team_id):
            require_member(session, team_id, user, keeper=True)
        if session.get(Match, match.id) is None:
            session.add(Match(**match.model_dump(), created_by=user.id))
            saved.matches += 1
        else:
            already_had.matches += 1  # a match's teams and length never change after it's created
    session.flush()


def _save_events(session: Session, body: UploadIn, user: User, saved: UploadCounts, already_had: UploadCounts) -> None:
    if not body.events:
        return
    for match_id in {event.match_id for event in body.events}:
        require_match_access(session, match_id, user, keeper=True)

    rows = [_event_row(event, user) for event in body.events]
    # "ON CONFLICT (id) DO NOTHING": a tap the server already has is skipped instead of saved twice.
    # This is what makes retrying an upload safe.
    new_ids = session.scalars(
        insert(Event).values(rows).on_conflict_do_nothing(index_elements=["id"]).returning(Event.id)
    ).all()
    saved.events += len(new_ids)
    already_had.events += len(rows) - len(new_ids)


def _event_row(event: EventIn, user: User) -> dict[str, Any]:
    row = event.model_dump()
    # The database stores every result as text; pass ratings (0-3) arrive as numbers.
    row["result"] = None if event.result is None else str(event.result)
    row["uploaded_by"] = user.id
    return row


@router.get("/sync/download")
def download(user: CurrentUser, session: SessionDep) -> DownloadOut:
    """Your teams (with your role), their rosters, and their matches. Taps come from /matches/{id}/events."""
    memberships = session.execute(
        select(Team, TeamMember.role)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(TeamMember.user_id == user.id)
    ).all()
    team_ids = [team.id for team, _ in memberships]
    players = session.scalars(select(Player).where(Player.team_id.in_(team_ids)).order_by(Player.number)).all()
    matches = session.scalars(
        select(Match)
        .where(or_(Match.home_team_id.in_(team_ids), Match.away_team_id.in_(team_ids)))
        .order_by(Match.created_at.desc())
    ).all()
    return DownloadOut(
        teams=[TeamOut(id=team.id, name=team.name, role=role) for team, role in memberships],
        players=[PlayerIn.model_validate(p) for p in players],
        matches=[MatchIn.model_validate(m) for m in matches],
    )


@router.get("/matches/{match_id}/events", response_model=list[EventIn], response_model_exclude_none=True)
def match_events(
    match_id: uuid.UUID,
    user: CurrentUser,
    session: SessionDep,
    after_seq: Annotated[int, Query(alias="afterSeq", ge=0)] = 0,
) -> list[EventIn]:
    """A match's taps in order. Pass afterSeq to get only the taps newer than the ones you already have."""
    require_match_access(session, match_id, user)
    events = session.scalars(
        select(Event).where(Event.match_id == match_id, Event.seq > after_seq).order_by(Event.seq)
    ).all()
    return [_event_out(event) for event in events]


def _event_out(event: Event) -> EventIn:
    out = EventIn.model_validate(event)
    if event.type == "pass" and event.result is not None:
        out.result = int(event.result)  # back to a number, the way the app stores pass ratings
    return out
