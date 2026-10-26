from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.factories import auth_headers, make_member, make_team, make_user


@pytest.fixture
def team(session: Session) -> dict[str, Any]:
    """A team with one keeper and one viewer, plus someone with an account who isn't on it."""
    keeper = make_user(session, "keeper@example.com")
    viewer = make_user(session, "viewer@example.com")
    outsider = make_user(session, "outsider@example.com")
    team = make_team(session, keeper)
    make_member(session, team, keeper, "keeper")
    make_member(session, team, viewer, "viewer")
    return {"team": team, "keeper": keeper, "viewer": viewer, "outsider": outsider, "url": f"/teams/{team.id}/members"}


def test_members_can_see_who_is_on_the_team(client: TestClient, team: dict[str, Any]) -> None:
    for person in (team["keeper"], team["viewer"]):
        response = client.get(team["url"], headers=auth_headers(person))
        assert response.status_code == 200
        assert [(m["email"], m["role"]) for m in response.json()] == [
            ("keeper@example.com", "keeper"),
            ("viewer@example.com", "viewer"),
        ]


def test_outsiders_cant_even_tell_the_team_exists(client: TestClient, team: dict[str, Any]) -> None:
    response = client.get(team["url"], headers=auth_headers(team["outsider"]))
    assert response.status_code == 404
    assert response.json() == {"detail": "Team not found"}


def test_you_need_to_be_logged_in(client: TestClient, team: dict[str, Any]) -> None:
    assert client.get(team["url"]).status_code == 401


def test_a_keeper_adds_someone_by_email(client: TestClient, team: dict[str, Any]) -> None:
    response = client.put(
        team["url"], json={"email": "Outsider@Example.com", "role": "viewer"}, headers=auth_headers(team["keeper"])
    )
    assert response.status_code == 200
    assert response.json()["role"] == "viewer"
    # Now they can see the team.
    assert client.get(team["url"], headers=auth_headers(team["outsider"])).status_code == 200


def test_a_keeper_changes_someones_role(client: TestClient, team: dict[str, Any]) -> None:
    response = client.put(
        team["url"], json={"email": "viewer@example.com", "role": "keeper"}, headers=auth_headers(team["keeper"])
    )
    assert response.json()["role"] == "keeper"


def test_viewers_cant_change_the_team(client: TestClient, team: dict[str, Any]) -> None:
    response = client.put(
        team["url"], json={"email": "outsider@example.com", "role": "keeper"}, headers=auth_headers(team["viewer"])
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "Only the team's stat keepers can do that"}


def test_adding_someone_without_an_account(client: TestClient, team: dict[str, Any]) -> None:
    response = client.put(
        team["url"], json={"email": "new@example.com", "role": "viewer"}, headers=auth_headers(team["keeper"])
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "No account uses that email. Ask them to sign up first."}


def test_a_keeper_removes_someone(client: TestClient, team: dict[str, Any]) -> None:
    url = f"{team['url']}/{team['viewer'].id}"
    assert client.delete(url, headers=auth_headers(team["keeper"])).status_code == 204
    assert client.get(team["url"], headers=auth_headers(team["viewer"])).status_code == 404


def test_anyone_can_leave_but_viewers_cant_remove_others(client: TestClient, team: dict[str, Any]) -> None:
    remove_keeper = f"{team['url']}/{team['keeper'].id}"
    assert client.delete(remove_keeper, headers=auth_headers(team["viewer"])).status_code == 403

    leave = f"{team['url']}/{team['viewer'].id}"
    assert client.delete(leave, headers=auth_headers(team["viewer"])).status_code == 204


def test_the_last_keeper_cant_leave_or_step_down(client: TestClient, team: dict[str, Any]) -> None:
    headers = auth_headers(team["keeper"])
    leave = client.delete(f"{team['url']}/{team['keeper'].id}", headers=headers)
    step_down = client.put(team["url"], json={"email": "keeper@example.com", "role": "viewer"}, headers=headers)

    for response in (leave, step_down):
        assert response.status_code == 409
        assert response.json()["detail"].startswith("A team needs at least one stat keeper")
