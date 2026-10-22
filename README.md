# Men's Volleyball Stat Tracker

A courtside stat tracker for men's volleyball, built to show both software engineering and data engineering:

- **Phase 1 (in progress):** a phone app for entering stats during a match
- **Phase 2:** a backend with offline sync, accounts, and a live box score link
- **Phase 3:** a data pipeline and warehouse with volleyball-aware data quality tests
- **Phase 4:** NCAA men's volleyball play-by-play as a second data source

## How it works

Every tap courtside is saved as an **event**: who did what, in which set and rally. The app never stores stats like "#11 has 5 kills". It stores the list of taps and counts through it whenever it needs the score, the rotation, or a box score. Undo doesn't erase a tap; it adds a new event that says "ignore that one". The list only ever grows.

This makes undo safe, means stats can't drift out of sync with what happened, and keeps later phases simple: syncing to a server or loading a warehouse just means copying events that haven't been copied yet.

## Volleyball rules the app follows

Who gets the point (code: `app/src/domain/rules.ts`):

| Point for us | Point for them | Rally continues |
|---|---|---|
| serve ace | serve error | serve in |
| kill | attack error (including getting blocked) | attack in play |
| block solo, block assist | block error | dig, assist |
| their error | pass 0 (we got aced) | pass 1–3 |
| | ball handling error | |
| | their point | |

## Repository layout

```
app/        Phase 1: React + TypeScript stat entry app (Vite)
api/        Phase 2: FastAPI backend (not started)
pipeline/   Phase 3: DuckDB + dbt + Dagster (not started)
```

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
| `npm test` | run the tests once |
| `npm run test:watch` | re-run tests every time you save a file |
| `npm run build` | type-check and build the production files into `app/dist/` |
| `npm run lint` | check the code for common mistakes |

## Stats tracked (Phase 1 goal)

The box score will match the official NCAA box score: sets played, kills, attack errors, total attacks, hitting %, assists, service aces, service errors, reception attempts and errors, digs, block solos, block assists, block errors, ball handling errors, and points.

It also tracks coaching stats NCAA doesn't record: pass rating (0–3), serve type (jump spin, jump float, standing float), and front/back row attacks.

## Decisions

| Decision | Why |
|---|---|
| Save taps (events), compute stats | Undo is safe, stats can't drift, and sync/warehouse loading become "copy new rows" |
| Undo adds an event instead of deleting | The event list only grows, so syncing it in Phase 2 never has to handle deletions |
| React + TypeScript + Vite | Industry-standard frontend stack; TypeScript catches mistakes like a misspelled stat name before the app runs |
| Vitest for tests | Built for Vite, so tests use the same setup as the app |
| npm | Comes with Node, nothing extra to install |
| TypeScript `strict` mode on | Catches missing values (like a player with no number) at compile time |
| Line endings normalized to LF | Windows and Linux (CI in Phase 2) see identical files |
