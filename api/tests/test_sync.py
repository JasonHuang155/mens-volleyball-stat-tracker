"""Uploading from the app and downloading back. The JSON here has the same shape the app saves."""

import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Event, User
from tests.factories import auth_headers, make_user


def new_id() -> str:
    return str(uuid.uuid4())


def now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")  # the way JavaScript writes times


def event_json(match_id: str, seq: int, **fields: Any) -> dict[str, Any]:
    """A tap as the app saves it. By default, a point with no stat for the home team."""
    return {
        "id": new_id(),
        "matchId": match_id,
        "seq": seq,
        "actionId": new_id(),
        "createdAt": now(),
        "setNumber": 1,
        "rallyNumber": seq,
        "servingSide": "home",
        "homeRotation": 1,
        "awayRotation": 1,
        "type": "point",
        "side": "home",
    } | fields


@pytest.fixture
def batch() -> dict[str, Any]:
    """Two teams with a player each, a match between them, and a few taps: what a phone would upload."""
    home, away, match = new_id(), new_id(), new_id()
    setter, receiver = new_id(), new_id()
    lineup = {"players": [setter] + [new_id() for _ in range(5)], "setterId": setter, "liberoId": None}
    return {
        "teams": [{"id": home, "name": "Huskies"}, {"id": away, "name": "Rivals"}],
        "players": [
            {"id": setter, "teamId": home, "name": "Sam Setter", "number": 1, "position": "S"},
            {"id": receiver, "teamId": away, "name": "", "number": 14, "position": "OH"},
        ],
        "matches": [{"id": match, "homeTeamId": home, "awayTeamId": away, "bestOf": 5, "createdAt": now()}],
        "events": [
            event_json(match, 1, type="set_start", detail={"home": lineup, "away": lineup, "firstServe": "home"}),
            event_json(match, 2, type="serve", playerId=setter, result="ace", detail={"serveType": "jump_spin"}),
            event_json(match, 3, type="pass", side="away", playerId=receiver, result=0),
            event_json(match, 4, type="point", side="away"),
        ],
    }


@pytest.fixture
def keeper(session: Session) -> User:
    return make_user(session, "keeper@example.com")


def upload(client: TestClient, user: User, body: dict[str, Any]) -> Any:
    return client.post("/sync/upload", json=body, headers=auth_headers(user))


def event_count(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(Event)) or 0


def test_uploads_a_batch_and_reports_what_was_new(client: TestClient, keeper: User, batch: dict[str, Any]) -> None:
    response = upload(client, keeper, batch)
    assert response.status_code == 200
    assert response.json() == {
        "saved": {"teams": 2, "players": 2, "matches": 1, "events": 4},
        "alreadyHad": {"teams": 0, "players": 0, "matches": 0, "events": 0},
    }


def test_whoever_uploads_a_new_team_is_its_keeper(client: TestClient, keeper: User, batch: dict[str, Any]) -> None:
    upload(client, keeper, batch)
    team_id = batch["teams"][0]["id"]
    members = client.get(f"/teams/{team_id}/members", headers=auth_headers(keeper)).json()
    assert [(m["email"], m["role"]) for m in members] == [("keeper@example.com", "keeper")]


def test_taps_come_back_exactly_as_the_app_sent_them(client: TestClient, keeper: User, batch: dict[str, Any]) -> None:
    upload(client, keeper, batch)
    match_id = batch["matches"][0]["id"]
    returned = client.get(f"/matches/{match_id}/events", headers=auth_headers(keeper)).json()

    assert len(returned) == 4
    for sent, got in zip(batch["events"], returned, strict=True):
        assert datetime.fromisoformat(got.pop("createdAt")) == datetime.fromisoformat(sent["createdAt"])
        assert got == {key: value for key, value in sent.items() if key != "createdAt"}
    assert returned[2]["result"] == 0  # pass ratings come back as numbers
    assert "playerId" not in returned[3]  # fields a tap doesn't have are left out, as in the app


def test_retrying_an_upload_never_saves_anything_twice(
    client: TestClient, session: Session, keeper: User, batch: dict[str, Any]
) -> None:
    upload(client, keeper, batch)
    retry = upload(client, keeper, batch)  # e.g. the connection dropped before the phone heard back

    assert retry.status_code == 200
    assert retry.json()["saved"] == {"teams": 0, "players": 0, "matches": 0, "events": 0}
    assert retry.json()["alreadyHad"] == {"teams": 2, "players": 2, "matches": 1, "events": 4}
    assert event_count(session) == 4


def test_a_retry_with_some_new_taps_saves_only_the_new_ones(
    client: TestClient, session: Session, keeper: User, batch: dict[str, Any]
) -> None:
    upload(client, keeper, batch)
    match_id = batch["matches"][0]["id"]
    batch["events"] += [event_json(match_id, 5), event_json(match_id, 6)]

    response = upload(client, keeper, batch)
    assert response.json()["saved"]["events"] == 2
    assert response.json()["alreadyHad"]["events"] == 4
    assert event_count(session) == 6


def test_only_one_device_can_record_a_match(
    client: TestClient, session: Session, keeper: User, batch: dict[str, Any]
) -> None:
    upload(client, keeper, batch)
    match_id = batch["matches"][0]["id"]
    # A second phone's tap #4 (a different id) and its tap #5.
    response = upload(client, keeper, {"events": [event_json(match_id, 5), event_json(match_id, 4)]})

    assert response.status_code == 409
    assert response.json()["detail"].startswith("Another device has already recorded taps for this match")
    assert event_count(session) == 4  # all or nothing: tap #5 wasn't saved either


def test_edits_from_the_phone_are_saved(client: TestClient, keeper: User, batch: dict[str, Any]) -> None:
    upload(client, keeper, batch)
    batch["teams"][0]["name"] = "NU Huskies"
    batch["players"][0]["number"] = 12
    upload(client, keeper, {"teams": [batch["teams"][0]], "players": [batch["players"][0]]})

    download = client.get("/sync/download", headers=auth_headers(keeper)).json()
    assert {t["name"] for t in download["teams"]} == {"NU Huskies", "Rivals"}
    assert {p["number"] for p in download["players"]} == {12, 14}


def test_download_has_your_teams_rosters_and_matches(client: TestClient, keeper: User, batch: dict[str, Any]) -> None:
    upload(client, keeper, batch)
    download = client.get("/sync/download", headers=auth_headers(keeper)).json()

    assert sorted((t["name"], t["role"]) for t in download["teams"]) == [("Huskies", "keeper"), ("Rivals", "keeper")]
    assert {p["id"] for p in download["players"]} == {p["id"] for p in batch["players"]}
    assert [m["id"] for m in download["matches"]] == [batch["matches"][0]["id"]]


def test_after_seq_gets_only_newer_taps(client: TestClient, keeper: User, batch: dict[str, Any]) -> None:
    upload(client, keeper, batch)
    match_id = batch["matches"][0]["id"]
    newer = client.get(f"/matches/{match_id}/events?afterSeq=2", headers=auth_headers(keeper)).json()
    assert [e["seq"] for e in newer] == [3, 4]


def test_viewers_can_look_but_not_upload(
    client: TestClient, session: Session, keeper: User, batch: dict[str, Any]
) -> None:
    upload(client, keeper, batch)
    viewer = make_user(session, "viewer@example.com")
    home_id, match_id = batch["teams"][0]["id"], batch["matches"][0]["id"]
    client.put(
        f"/teams/{home_id}/members", json={"email": viewer.email, "role": "viewer"}, headers=auth_headers(keeper)
    )

    assert client.get(f"/matches/{match_id}/events", headers=auth_headers(viewer)).status_code == 200
    teams = client.get("/sync/download", headers=auth_headers(viewer)).json()["teams"]
    assert [(t["name"], t["role"]) for t in teams] == [("Huskies", "viewer")]

    response = upload(client, viewer, {"events": [event_json(match_id, 5)]})
    assert response.status_code == 403


def test_outsiders_cant_see_or_change_anything(
    client: TestClient, session: Session, keeper: User, batch: dict[str, Any]
) -> None:
    upload(client, keeper, batch)
    outsider = make_user(session, "outsider@example.com")
    session.commit()  # a real account is saved before it logs in; a refused upload's rollback mustn't undo it
    match_id, home_id = batch["matches"][0]["id"], batch["teams"][0]["id"]

    assert client.get(f"/matches/{match_id}/events", headers=auth_headers(outsider)).status_code == 404
    assert upload(client, outsider, {"events": [event_json(match_id, 5)]}).status_code == 404
    player = {"id": new_id(), "teamId": home_id, "number": 9, "position": "OH"}
    assert upload(client, outsider, {"players": [player]}).status_code == 404
    renamed = upload(client, outsider, {"teams": [{"id": home_id, "name": "Taken Over"}]})
    assert renamed.status_code == 404
    assert client.get("/sync/download", headers=auth_headers(outsider)).json()["teams"] == []


@pytest.mark.parametrize(
    "bad_fields",
    [{"homeRotation": 7}, {"type": "spike"}, {"side": "middle"}, {"seq": 0}],
    ids=["rotation 7", "unknown type", "unknown side", "seq 0"],
)
def test_impossible_taps_are_turned_away(
    client: TestClient, keeper: User, batch: dict[str, Any], bad_fields: dict[str, Any]
) -> None:
    batch["events"][1] |= bad_fields
    assert upload(client, keeper, batch).status_code == 422


def test_a_tap_naming_an_unknown_player_is_explained(client: TestClient, keeper: User, batch: dict[str, Any]) -> None:
    batch["events"][1]["playerId"] = new_id()
    response = upload(client, keeper, batch)
    assert response.status_code == 422
    assert response.json()["detail"] == "A tap names a player the server doesn't have. Upload the roster first."


def test_a_match_needs_two_different_teams(client: TestClient, keeper: User, batch: dict[str, Any]) -> None:
    batch["matches"][0]["awayTeamId"] = batch["matches"][0]["homeTeamId"]
    response = upload(client, keeper, batch)
    assert response.status_code == 422
    assert response.json()["detail"] == "A match needs two different teams"


def test_a_player_cant_move_to_another_team(client: TestClient, keeper: User, batch: dict[str, Any]) -> None:
    upload(client, keeper, batch)
    moved = batch["players"][0] | {"teamId": batch["teams"][1]["id"]}
    response = upload(client, keeper, {"players": [moved]})
    assert response.status_code == 409


def test_syncing_needs_a_login(client: TestClient, batch: dict[str, Any]) -> None:
    assert client.post("/sync/upload", json=batch).status_code == 401
    assert client.get("/sync/download").status_code == 401
