# Men's Volleyball Stat Tracker

[![CI](https://github.com/JasonHuang155/mens-volleyball-stat-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/JasonHuang155/mens-volleyball-stat-tracker/actions/workflows/ci.yml)

**Try it:** https://jasonhuang155.github.io/mens-volleyball-stat-tracker/ (works best on a phone; your data stays on your device)

A courtside stat tracker for men's volleyball that records both teams, the way an NCAA stat crew does. It's built to show both software engineering and data engineering:

- **Phase 1 (done):** a phone app for entering stats during a match
- **Phase 2:** a backend with offline sync, accounts, and a live box score link
- **Phase 3:** a data pipeline and warehouse with volleyball-aware data quality tests
- **Phase 4:** NCAA men's volleyball play-by-play as a second data source

## How it works

Every tap courtside is saved as an **event**: who did what, for which team, in which set and rally. The app never stores stats like "#11 has 5 kills". It stores the list of taps and counts through it whenever it needs the score, the rotations, or a box score. Undo doesn't erase a tap; it adds a new event that says "ignore that one". The list only ever grows.

This makes undo safe, means stats can't drift out of sync with what happened, and keeps later phases simple: syncing to a server or loading a warehouse just means copying events that haven't been copied yet.

Both teams are tracked: each has a roster, a lineup, a rotation, a libero, and subs, and every player tap says which team (`home` or `away`) it belongs to. NCAA play-by-play also covers both teams, so Phase 4 data fits the same shape.

## Volleyball rules the app follows

### Who gets the point (`app/src/domain/rules.ts`)

From the point of view of the player's own team:

| Their team wins the point | The other team wins the point | Rally continues |
|---|---|---|
| serve ace | serve error | serve in |
| kill | attack error (including getting blocked) | attack in play |
| block solo, block assist | block error | dig, assist |
| "point, no stat" (a penalty or a missed rally) | pass 0 (they got aced) | pass 1–3 |
| | ball handling error | |

Sets go to 25, win by 2. The deciding set (set 3 of a best of 3, set 5 of a best of 5) goes to 15, win by 2. There's no cap, so 33–31 is a legal score.

### Serving and rotation (`app/src/domain/replay.ts`)

- Court positions are numbered 1–6: 1 is right back (the server), 2–4 are the front row, 5 and 6 are the back row.
- If the serving team wins the rally, the same player serves again. If the receiving team wins (a **sideout**), it serves next and rotates clockwise: position 2 moves to 1 and serves, and position 1 moves to 6.
- Rotations are named the way coaches name them, by where the setter is: rotation 1 means the setter is in position 1. Each rotation moves the setter back one spot, so a set goes rotation 1, 6, 5, 4, 3, 2, 1. Each team has its own rotation.
- Only the serving team's player in position 1 can serve. Pass ratings (0–3) are serve-receive stats, the same as NCAA "receptions", so they're only accepted for the receiving team.

### Substitutions and the libero

- A substitute takes the same spot in the rotation as the player they replace.
- Each team's libero starts each set on the bench and can only come in for a back-row player. Only the player they replaced can come back in for them.
- The libero can't play in the front row. When they would rotate into position 4, the app brings the player they replaced back in automatically.
- Phase 1 doesn't enforce substitution limits or libero serving rules.

### Plays that involve more than one player (`app/src/domain/plays.ts`)

Many plays credit several players, often on both teams, like on an NCAA stat sheet. The first tap scores the point; the others are **follow-ups** that join the same play (the same `actionId`), so the play still scores once and Undo removes it as a whole.

| First tap | The app asks | Follow-up recorded |
|---|---|---|
| Kill | "Assist by?" | assist for a teammate |
| Ace | "Who was aced?" (or "Untouched") | reception error (pass 0) for the receiver |
| Pass 0 | nothing: the server is known | ace for the server, added automatically |
| Attack error | "Blocked by?" (or "Not blocked") | one blocker = block solo; two or three = a block assist each |
| Block solo | "Whose attack?" | attack error for the hitter |
| Block assist | "Who else blocked?", then "Whose attack?" | block assists, then the attack error |

The rules check that follow-ups make sense (an assist only on a kill, a reception error only by the other team, at most three blockers, no mixing a solo block with block assists), and that one play never gives the point to both teams.

### Undo

Undo cancels the whole last play. Pressing it again goes back one more play. Only the last play can be undone, because changing an older point would change who served and the rotations for everything after it.

## Setup

You need [Node.js](https://nodejs.org) (LTS version, 24 or newer) and Git.

```bash
cd app
npm install        # download the libraries listed in package.json
npm run dev        # start the app at http://localhost:5173
```

Other commands, run from `app/`:

| Command | What it does |
|---|---|
| `npm run dev:phone` | start the app so a phone on the same Wi-Fi can open it (see below) |
| `npm test` | run the tests once |
| `npm run test:watch` | re-run tests every time you save a file |
| `npm run build` | type-check and build the production files into `app/dist/` |
| `npm run lint` | check the code for common mistakes |

### The server (Phase 2, in progress)

You also need [Docker Desktop](https://www.docker.com/products/docker-desktop/) (it runs Postgres) and [uv](https://docs.astral.sh/uv/) (it installs the Python libraries). From the repository root:

```bash
docker compose up -d db        # start Postgres in Docker (at localhost:5433)
cd api
uv sync                        # install the Python libraries listed in uv.lock
uv run pytest                  # run the server's tests (they use a separate volleyball_test database)
uv run uvicorn app.main:app --reload   # run the server at http://localhost:8000 (docs at /docs)
```

Or run the database and the server together in Docker with `docker compose up --build`. `docker compose down` stops everything; your data stays in a Docker volume.

The database is published on port **5433** instead of Postgres's usual 5432, so it doesn't clash with a PostgreSQL installed directly on Windows. Inside Docker, the server reaches it at `db:5432`.

| Command (from `api/`) | What it does |
|---|---|
| `uv run pytest` | run the server tests |
| `uv run ruff check` | check the Python code for common mistakes |
| `uv run ruff format` | tidy the Python code's formatting |
| `uv run alembic upgrade head` | bring your database's tables up to date (the server's container does this itself when it starts) |
| `uv run alembic revision --autogenerate -m "what changed"` | after changing `app/models.py`, write a migration for it |

**Migrations** are step-by-step instructions for building and changing the database's tables, kept in `api/migrations/versions/`. Instead of editing tables by hand, every change is a new migration file, so the laptop, the test database, and the hosted database can each be brought to exactly the same shape, and a change can be undone. A test fails if `app/models.py` changes without a matching migration.

### Try it on your phone

1. Put the phone on the same Wi-Fi as the computer.
2. From `app/`, run `npm run dev:phone`. It prints a `Network:` address like `http://10.0.0.29:5173`.
3. The first time, Windows Firewall asks whether Node.js may use the network. Allow it. If Windows has your home Wi-Fi marked as a Public network, either tick "Public networks" in that prompt, or change the network to Private (Settings → Network & internet → Wi-Fi → your network → Network profile type), which is the usual setting for a home network.
4. Open the `Network:` address in the phone's browser. The first load over Wi-Fi can take a few seconds.

Things to know:
- Campus and public Wi-Fi often block devices from reaching each other. If the phone can't load the page, turn on the phone's hotspot and connect the computer to it.
- If something goes wrong, the page says so instead of staying blank: "Loading…" while starting, "The app couldn't start" with the reason if a script fails, a message for browsers too old to run it, and "Something went wrong" with the error if a screen crashes.
- Data saved on the phone stays on the phone, separate from the computer's browser. It's also tied to that exact address. If the computer's address changes (a different network), the phone opens a fresh, empty app; the old data is still there under the old address. Phase 2 puts the app at one permanent web address and syncs data to a server.

## Repository layout

```
app/                 Phase 1: React + TypeScript stat entry app (Vite)
api/                 Phase 2: FastAPI server
  app/                 the server code: main.py, config.py, db.py, models.py, schemas.py,
                       security.py, auth.py, permissions.py, teams.py, sync.py
  migrations/          Alembic migrations that build the database's tables
  tests/               pytest tests
  db-init/             creates the test database the first time Postgres starts
  Dockerfile           how to package the server as a container
pipeline/            Phase 3: DuckDB + dbt + Dagster (not started)
docker-compose.yml   starts Postgres (and the server) on your laptop
.github/workflows/   Automatic checks and publishing on GitHub
```

GitHub Actions run two workflows:
- `ci.yml` checks the app (lint, type check, tests, build) and the server (lint, formatting, tests against a real Postgres, and a container build) on every push and pull request.
- `pages.yml` publishes the app as a website on GitHub Pages whenever `main` changes. The site is served from `/<repository-name>/`, so the build gets that prefix (`BASE_PATH`), and a copy of the app is saved as `404.html` so opening a deeper address like `/matches/…` directly still loads the app.

## Code tour

### Volleyball logic (`app/src/domain/`)

No screens or database here, so it's easy to test.

| File | What it does |
|---|---|
| `types.ts` | What every event and the match state look like |
| `rules.ts` | Who gets the point; set and match win rules |
| `replay.ts` | `replay()`: plays back the events to rebuild the score, server, and both teams' courts |
| `plays.ts` | Which follow-ups fit a play, and the questions to ask after it |
| `record.ts` | `recordAction()`, `recordFollowUp()`, `recordUndo()`: turn a tap into a saved event, after checking it with `replay()` |
| `undo.ts` | `activeEvents()`: the events that still count after undos |
| `boxScore.ts` | Per-player stats in NCAA box score columns, and the team row. Written test-first: the tests came before the code |

### Storage (`app/src/db/`)

Everything is saved on the phone in IndexedDB, the database built into every browser, using the Dexie library. It works offline and survives refreshes.

| Table | Holds |
|---|---|
| `teams` | team name (your team and the teams you play) |
| `players` | roster: jersey number, position, and an optional name |
| `matches` | home team, away team, best of 3 or 5, when it was created |
| `events` | every tap: the list the volleyball logic replays |

| File | What it does |
|---|---|
| `database.ts` | Table definitions. Version 2 added home/away teams; upgrading clears matches saved by the one-team version 1 (teams and players are kept) |
| `roster.ts` | Teams and players. Jersey numbers must be unique per team, and a player who has played in a match can't be deleted |
| `matches.ts` | Matches, plus `recordTap()`, `recordFollowUpTap()`, `undoLastTap()`: check a tap with the volleyball logic, then save it |

Each tap is checked and saved inside one database transaction. Transactions on the same table run one at a time, so two fast taps can't get the same `seq` number.

### Screens (`app/src/screens/`)

| Address | Screen |
|---|---|
| `/` | Home: your teams, a New match button, and every match with where it stands ("Rivals at Huskies · Set 2 · 10–12") |
| `/teams/:teamId` | Roster: add players (number, position, optional name), tap a player to edit or delete them |
| `/new-match` | New match: away team, home team, best of 3 or 5 |
| `/matches/:matchId` | The match: scoreboard, then both lineups before each set, or the courtside tap screen during a set |
| `/matches/:matchId/box-score` | Box score: a table per team in NCAA columns, with team rows. Whole match or one set |

**The lineup form**, shown before every set: each team's six spots are laid out like the court, and a player can only be picked once. Setters and liberos are guessed from roster positions (S and L). From set 2 on, it starts from the previous set's lineups, with the other team serving first. Check the first serve for the deciding set, which is decided by a coin toss.

**The courtside tap screen** (`LiveEntry.tsx`):
- Both teams on one court picture, seen from behind the home baseline: away (orange) across the net, home (blue) on the near side. Every stat is two taps: the player, then what they did. A "Last:" line confirms what was saved.
- Only buttons that make sense right now appear: serve buttons only for the server, pass ratings only for the receiving team, block buttons only for front-row players.
- Each player's serve type (jump spin, jump float, standing float) defaults to the type they served last. Attacks are marked front or back row from where the player is standing.
- After plays that involve other players, the question ("Blocked by?") appears in the button area, so the court doesn't move. It offers the players who were on court when the play happened, even if a sideout has rotated them since. Skipping is fine, and it still appears after the point that ends a set.
- "+1" buttons give a team a point with no stat. Undo and Subs (pick a team; one-tap libero in/out, or a regular sub) are always there.
- It's compacted to fit a phone screen without scrolling: the rotations sit in the scoreboard, and the net line names the teams.

**The box score** (`BoxScoreScreen.tsx`): columns in NCAA order (S, K, E, TA, PCT, A, SA, SE, reception attempts and errors, DIG, BS, BA, BE, BHE, PTS), plus pass average and total blocks. Hitting % is written the NCAA way (".333", "-.100", and "—" with no attempts). The team row adds up the counts but works hitting % and pass average out again from the totals; averaging players would count a 1-for-1 player as much as a 10-for-20 one. On a phone the table scrolls sideways while the player column stays put.

When a tap breaks a rule, the screen shows the plain reason ("No set is in progress"): the volleyball logic throws a `RuleError` carrying that reason plus the event details for debugging.

Phone-friendly details: tap targets are at least 52px tall on the tap screen and 56px elsewhere; text boxes use 16px+ text so iPhones don't zoom in; double-tap zoom is off (`touch-action: manipulation`); the jersey number box brings up the number keypad; deleting a player takes two taps.

### Server database (`api/app/models.py`)

| Table | Holds |
|---|---|
| `users` | email and password hash (never the password itself) |
| `teams`, `players`, `matches` | the same as on the phone, with the same ids |
| `team_members` | who belongs to which team, as a `keeper` (can record) or `viewer` (read-only) |
| `events` | every tap, with the same fields as on the phone, plus when it reached the server and who uploaded it |

- Teams, players, matches, and events keep the ids the phone made. A tap's id is its primary key, so uploading the same tap twice can't create a second row. That's what makes retried uploads safe.
- CHECK constraints make the database itself refuse impossible values (a side that isn't home or away, a rotation outside 1–6, best of 4, a team playing itself), as a last line of defense behind the app's own checks.
- Type-specific details (serve type, attack row, lineups, the undone action) are stored as JSON in `events.detail`.

### Accounts and roles (`api/app/auth.py`, `teams.py`, `permissions.py`)

| Endpoint | What it does |
|---|---|
| `POST /auth/signup` | make an account (email + password of 8+ characters); you're logged in straight away |
| `POST /auth/login` | log in; returns a token |
| `GET /auth/me` | the account the token belongs to |
| `GET /teams/{id}/members` | everyone on a team and their role (any member) |
| `PUT /teams/{id}/members` | add someone by email, or change their role (keepers only) |
| `DELETE /teams/{id}/members/{user_id}` | remove someone (keepers), or leave the team yourself |

- **Passwords** are never stored. The server keeps an Argon2 hash, a scrambled version that can check a password but can't be turned back into it.
- **Logging in** returns a token (a signed JWT saying "this is user X until date Y"). The app sends it with every request in an `Authorization: Bearer …` header. Tokens last 30 days, because the app is often offline courtside.
- **Login errors don't leak information:** a wrong password and an unknown email get the same answer and take about the same time, so nobody can test which emails have accounts.
- **Roles are per team:** a **keeper** can record matches and manage members; a **viewer** can only look. To anyone not on a team, the team appears not to exist (404). A team always keeps at least one keeper.
- **Secrets:** tokens are signed with `JWT_SECRET`. Laptops use a development value; the server refuses to start with `ENVIRONMENT=production` unless a real secret is set.
- Try it at http://localhost:8000/docs: sign up, copy the `accessToken`, click **Authorize**, and paste it.

### Syncing (`api/app/sync.py`)

| Endpoint | What it does |
|---|---|
| `POST /sync/upload` | save a batch of teams, players, matches, and taps from the phone (up to 1,000 taps at a time) |
| `GET /sync/download` | your teams (with your role on each), their rosters, and their matches |
| `GET /matches/{id}/events?afterSeq=N` | a match's taps in order; `afterSeq` skips the ones you already have |

- **Retrying is safe.** Every item keeps the id the phone gave it, and taps are saved with `INSERT … ON CONFLICT (id) DO NOTHING`, so a tap the server already has is skipped. The reply says how many of each were new (`saved`) and how many the server already had (`alreadyHad`). If the connection drops before the phone hears back, it just sends the same batch again.
- **All or nothing.** If anything in a batch is refused, nothing from it is saved, so the phone never has to work out which half made it.
- **One device per match.** Two phones recording the same match would both make a tap #5. The database allows only one tap per number per match, so the second phone gets a 409 with a plain explanation.
- **Who can upload:** uploading a new team makes you its keeper. Changing a team or its roster, starting a match, or adding taps needs a keeper. A match belongs to both of its teams, so members of either team can see it.
- **The JSON uses the app's names** (`matchId`, `setNumber`), so the phone sends what it already saves without renaming anything. Python code still uses `match_id`; Pydantic converts between the two.
- **Edits are uploaded too:** a renamed team or a changed jersey number replaces the server's copy. A player can't move to another team, because their old taps would then count for the wrong team.

### Tests

- Server tests run against a real Postgres. Each run empties the `volleyball_test` database and rebuilds it with the migrations; each test runs in a transaction that's rolled back afterwards, so tests can't affect each other. `tests/factories.py` saves test rows with sensible defaults.
- Logic and storage tests run in Node. `app/src/test/matchScript.ts` plays a match tap by tap, e.g. `new MatchScript().startSet().point('home', 3)`.
- Storage tests use `fake-indexeddb`, a pretend IndexedDB (`app/src/test/setup.ts`).
- Screen tests (`*.test.tsx`) use React Testing Library in a pretend browser (jsdom): they type and tap the way a person would. `app/src/test/renderApp.tsx` and `fixtures.ts` set up the app and two teams.

## Stats tracked

For both teams, the box score matches the official NCAA box score: sets played, kills, attack errors, total attacks, hitting %, assists, service aces, service errors, reception attempts and errors, digs, block solos, block assists, block errors, ball handling errors, and points.

It also tracks coaching stats NCAA doesn't record: pass rating (0–3), serve type (jump spin, jump float, standing float), and front/back row attacks.

## Known limits (end of Phase 1)

- Data lives only on the device that recorded it. Phase 2 adds syncing to a server.
- The app has to be loaded from a running dev server; it can't open with no connection yet. Phase 2 deploys it and makes it load offline.
- One device records a match. Two stat keepers on the same match isn't supported.
- Only the last play can be undone; older taps can't be edited.
- Substitution limits and libero serving rules aren't enforced.

## Decisions

| Decision | Why |
|---|---|
| Save taps (events), compute stats | Undo is safe, stats can't drift, and sync/warehouse loading become "copy new rows" |
| Track both teams, as home and away | That's how NCAA stat crews work, it gives a full box score for each team, and it matches NCAA play-by-play for Phase 4 |
| Linked plays (an ace is also a reception error, a block is also an attack error) | The same pairs an NCAA stat sheet records, so both teams' numbers stay consistent |
| Opponent player names are optional | Stat crews often only know the other team's jersey numbers |
| Undo adds an event instead of deleting | The event list only grows, so syncing it in Phase 2 never has to handle deletions |
| Each event has a `seq` number | Phone clocks can give two taps the same timestamp; `seq` gives an exact order |
| Each event has an `actionId` | Groups the events from one play, so a linked play scores once and undoes together |
| Events record the serving team and both rotations at the time of the tap | The app could recompute them, but SQL in Phase 3 would have to replay the whole match. Stamping them makes "sideout % by rotation" a simple GROUP BY, and gives the Phase 3 data tests something to check |
| `replay()` throws on impossible taps, and recording checks every tap with it | One place defines the rules. A tap that breaks them is never saved |
| Rotations named by the setter's position | The convention coaches use, so rotation 3 means the same thing in every set |
| Dexie for IndexedDB | IndexedDB's own interface is clunky; Dexie makes it a few readable lines and can refresh the screen when data changes |
| React Router for screens | Each screen gets its own web address, which Phase 2's shareable live box score link needs |
| Players can't be deleted once they've played | Their events would point at nobody, breaking box scores and Phase 3 season stats |
| The server stores taps; the app computes stats | One copy of the volleyball logic (the app's TypeScript), so the server and app can never disagree. The live box score page runs the same code |
| FastAPI + SQLAlchemy + Postgres | Widely used Python web stack. Postgres is a real database with the features Phase 3 needs |
| uv for Python libraries | One fast tool for Python and its libraries, with a lock file so the laptop, CI, and the server run identical versions |
| Docker Compose for local Postgres | One command starts a clean database; nothing to install or configure on Windows |
| JWT login tokens, Argon2 password hashes | Standard, well-understood choices: the server doesn't have to look anything up to check a token, and Argon2 is the current recommendation for storing passwords |
| Outsiders get "not found" for a team, not "forbidden" | Doesn't reveal that a team exists to people who aren't on it |
| Upload whole batches, keyed by the phone's ids | A phone courtside loses signal mid-upload. Skipping ids the server already has makes "send it again" always safe, with no extra bookkeeping on the phone |
| The server's JSON uses camelCase, like the app | The app's saved data goes up and comes back unchanged, so there's no renaming code to get wrong |
| Duplicate tap numbers are refused, not merged | Merging two phones' taps would need conflict rules; one device per match keeps the event log simple and in order |
| Tests use their own database | `volleyball_test` is separate, so running tests never touches development data |
| Errors are shown on the page | Phones have no developer console, so a blank page would give no clue what went wrong |
| `uuid` library for ids | The browser's built-in `crypto.randomUUID()` only works on https or localhost, and testing on a phone over Wi-Fi is neither |
| React + TypeScript + Vite | Industry-standard frontend stack; TypeScript catches mistakes like a misspelled stat name before the app runs |
| Vitest for tests | Built for Vite, so tests use the same setup as the app |
| TypeScript `strict` mode on | Catches missing values (like a player with no number) at compile time |
| Line endings normalized to LF | Windows and Linux (CI in Phase 2) see identical files |
