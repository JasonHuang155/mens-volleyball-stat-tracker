"""A team's members: list them, add or change someone's role, or remove someone.

(Teams themselves get onto the server when the app uploads them, in a later step.
Whoever uploads a team becomes its first keeper.)
"""

import uuid

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.auth import CurrentUser
from app.db import SessionDep
from app.models import TeamMember, User
from app.permissions import keeper_count, require_member
from app.schemas import MemberIn, MemberOut

router = APIRouter(prefix="/teams", tags=["teams"])

LAST_KEEPER = "A team needs at least one stat keeper. Make someone else a keeper first."


@router.get("/{team_id}/members")
def list_members(team_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> list[MemberOut]:
    """Everyone on the team and their role. Any member can see this."""
    require_member(session, team_id, user)
    rows = session.execute(
        select(TeamMember, User.email)
        .join(User, User.id == TeamMember.user_id)
        .where(TeamMember.team_id == team_id)
        .order_by(TeamMember.role, User.email)
    ).all()
    return [MemberOut(user_id=member.user_id, email=email, role=member.role) for member, email in rows]


@router.put("/{team_id}/members")
def add_or_change_member(team_id: uuid.UUID, body: MemberIn, user: CurrentUser, session: SessionDep) -> MemberOut:
    """Add someone to the team by their account's email, or change their role. Keepers only."""
    require_member(session, team_id, user, keeper=True)
    person = session.scalar(select(User).where(User.email == body.email.lower()))
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No account uses that email. Ask them to sign up first.")

    member = session.get(TeamMember, (team_id, person.id))
    if member is None:
        member = TeamMember(team_id=team_id, user_id=person.id, role=body.role)
        session.add(member)
    else:
        if member.role == "keeper" and body.role != "keeper" and keeper_count(session, team_id) == 1:
            raise HTTPException(status.HTTP_409_CONFLICT, detail=LAST_KEEPER)
        member.role = body.role
    session.commit()
    return MemberOut(user_id=person.id, email=person.email, role=member.role)


@router.delete("/{team_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(team_id: uuid.UUID, user_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> Response:
    """Take someone off the team. Keepers can remove anyone; anyone can remove themselves (leave)."""
    leaving = user_id == user.id
    require_member(session, team_id, user, keeper=not leaving)
    member = session.get(TeamMember, (team_id, user_id))
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="That person isn't on the team")
    if member.role == "keeper" and keeper_count(session, team_id) == 1:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=LAST_KEEPER)
    session.delete(member)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
