"""Who can do what with a team.

- A keeper can record matches and manage who's on the team.
- A viewer can see the team's matches but not change anything.
- Anyone else is treated as if the team doesn't exist, so outsiders can't even find out it's there.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Match, TeamMember, User


def role_in_team(session: Session, team_id: uuid.UUID, user_id: uuid.UUID) -> str | None:
    """The user's role on the team: keeper, viewer, or None if they aren't on it."""
    member = session.get(TeamMember, (team_id, user_id))
    return member.role if member else None


def require_member(session: Session, team_id: uuid.UUID, user: User, *, keeper: bool = False) -> str:
    """Stops the request unless the user is on the team (as a keeper, if `keeper` is True). Returns their role."""
    role = role_in_team(session, team_id, user.id)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Team not found")
    if keeper and role != "keeper":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only the team's stat keepers can do that")
    return role


def require_match_access(session: Session, match_id: uuid.UUID, user: User, *, keeper: bool = False) -> Match:
    """A match belongs to both of its teams: members of either team can see it, keepers of either can record it."""
    match = session.get(Match, match_id)
    if match is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Match not found")
    roles = {role_in_team(session, team_id, user.id) for team_id in (match.home_team_id, match.away_team_id)}
    if roles == {None}:  # not on either team: act as if the match doesn't exist
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Match not found")
    if keeper and "keeper" not in roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only the team's stat keepers can do that")
    return match


def keeper_count(session: Session, team_id: uuid.UUID) -> int:
    return (
        session.scalar(
            select(func.count())
            .select_from(TeamMember)
            .where(TeamMember.team_id == team_id, TeamMember.role == "keeper")
        )
        or 0
    )
