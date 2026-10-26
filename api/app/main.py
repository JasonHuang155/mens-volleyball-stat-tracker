from fastapi import FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app import auth, sync, teams
from app.db import SessionDep

app = FastAPI(
    title="Volleyball Stat Tracker API",
    description="Stores every tap from the stat tracker app, plus accounts and the live box score link.",
)
app.include_router(auth.router)
app.include_router(teams.router)
app.include_router(sync.router)


@app.get("/health", tags=["server"])
def health(session: SessionDep) -> dict[str, str]:
    """Is the server up, and can it reach the database? Hosting services call this to check on the server."""
    try:
        session.execute(text("SELECT 1"))
    except OperationalError as error:
        raise HTTPException(status_code=503, detail="The database isn't reachable") from error
    return {"status": "ok", "database": "ok"}
