from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.db import get_session

app = FastAPI(
    title="Volleyball Stat Tracker API",
    description="Stores every tap from the stat tracker app, plus accounts and the live box score link.",
)


@app.get("/health")
def health(session: Annotated[Session, Depends(get_session)]) -> dict[str, str]:
    """Is the server up, and can it reach the database? Hosting services call this to check on the server."""
    try:
        session.execute(text("SELECT 1"))
    except OperationalError as error:
        raise HTTPException(status_code=503, detail="The database isn't reachable") from error
    return {"status": "ok", "database": "ok"}
