# The recipe for the server's container: Python, the libraries from uv.lock, and our code.
FROM python:3.14-slim

# uv, copied from its official image at the same version used on the laptop.
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH="/app/.venv/bin:$PATH"

# Install the libraries first, in their own step, so Docker can reuse that step
# when only our code changes (much faster rebuilds).
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev

COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app

EXPOSE 8000
# Bring the database's tables up to date first, then start the server.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
