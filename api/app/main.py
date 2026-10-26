from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app import auth, sync, teams
from app.config import settings
from app.db import SessionDep

app = FastAPI(
    title="Volleyball Stat Tracker API",
    description="Stores every tap from the stat tracker app, plus accounts and the live box score link.",
)
# Lets the app's web page call the server. Logins travel in the Authorization header, not
# cookies, so no cookies are allowed across sites.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
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
