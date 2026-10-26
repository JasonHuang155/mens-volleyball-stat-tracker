import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User
from app.security import create_access_token, verify_password
from tests.factories import auth_headers, make_user


def test_signing_up_makes_an_account_and_logs_you_in(client: TestClient, session: Session) -> None:
    response = client.post("/auth/signup", json={"email": "Sam@Example.com", "password": "volleyball!"})

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "sam@example.com"  # emails are stored in lowercase
    assert body["token_type"] == "bearer" and body["access_token"]

    user = session.scalar(select(User).where(User.email == "sam@example.com"))
    assert user is not None
    assert user.password_hash != "volleyball!"  # the password itself is never stored
    assert verify_password("volleyball!", user.password_hash)


def test_one_account_per_email(client: TestClient, session: Session) -> None:
    make_user(session, "sam@example.com")
    response = client.post("/auth/signup", json={"email": "SAM@example.com", "password": "volleyball!"})
    assert response.status_code == 409
    assert response.json()["detail"] == "An account with that email already exists"


def test_signup_checks_the_email_and_password(client: TestClient) -> None:
    assert client.post("/auth/signup", json={"email": "not-an-email", "password": "volleyball!"}).status_code == 422
    assert client.post("/auth/signup", json={"email": "sam@example.com", "password": "short"}).status_code == 422


def test_logging_in_with_the_right_password(client: TestClient, session: Session) -> None:
    user = make_user(session, "sam@example.com", password="volleyball!")
    response = client.post("/auth/login", json={"email": "sam@example.com", "password": "volleyball!"})
    assert response.status_code == 200
    assert response.json()["user"]["id"] == str(user.id)


def test_a_wrong_password_and_an_unknown_email_get_the_same_answer(client: TestClient, session: Session) -> None:
    make_user(session, "sam@example.com", password="volleyball!")
    wrong_password = client.post("/auth/login", json={"email": "sam@example.com", "password": "basketball"})
    unknown_email = client.post("/auth/login", json={"email": "nobody@example.com", "password": "volleyball!"})

    # Different answers would let someone check which emails have accounts.
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json() == {"detail": "Wrong email or password"}


def test_the_token_says_who_you_are(client: TestClient, session: Session) -> None:
    user = make_user(session, "sam@example.com")
    response = client.get("/auth/me", headers=auth_headers(user))
    assert response.json() == {"id": str(user.id), "email": "sam@example.com"}


def test_requests_without_a_good_token_are_turned_away(client: TestClient, session: Session) -> None:
    user = make_user(session)
    expired, _ = create_access_token(user.id, now=datetime.now(UTC) - timedelta(days=365))
    real, _ = create_access_token(user.id)
    tampered = real[:-4] + ("AAAA" if not real.endswith("AAAA") else "BBBB")
    unknown_user, _ = create_access_token(uuid.uuid4())

    assert client.get("/auth/me").json() == {"detail": "Log in first"}
    for token in (expired, tampered, unknown_user, "not-a-token"):
        response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401
        assert response.json() == {"detail": "Your login has expired or isn't valid. Log in again."}
