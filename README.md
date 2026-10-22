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

Sets go to 25, win by 2. The deciding set (set 3 of a best of 3, set 5 of a best of 5) goes to 15, win by 2. There's no cap, so 33–31 is a legal score.

Serving and rotation (code: `app/src/domain/replay.ts`):

- Court positions are numbered 1–6: 1 is right back (the server), 2–4 are the front row, 5 and 6 are the back row.
- If the serving team wins the rally, the same player serves again. If the receiving team wins (a **sideout**), it serves next.
- When we side out, we rotate clockwise: position 2 moves to 1 and serves, and position 1 moves to 6.
- Rotations are named the way coaches name them, by where the setter is: rotation 1 means the setter is in position 1. Each rotation moves the setter back one spot, so a set goes rotation 1, 6, 5, 4, 3, 2, 1. We don't track the opponent's rotation.

Substitutions and the libero:

- A substitute takes the same spot in the rotation as the player they replace.
- The libero starts each set on the bench and can only come in for a back-row player. Only the player they replaced can come back in for them.
- The libero can't play in the front row. When they would rotate into position 4, the app brings the player they replaced back in automatically.
- Phase 1 doesn't enforce substitution limits or libero serving rules.

Plays with two players, and Undo (code: `app/src/domain/record.ts`, `undo.ts`):

- Some plays credit more than one player: the setter's assist on a kill, or two or three blockers on a block assist. The extra players are added as **follow-up** events that join the same play, so the play still scores one point.
- Undo cancels the whole last play (a kill and its assist together). Pressing it again goes back one more play. Only the last play can be undone, because changing an older point would change who served and the rotation for everything after it.

## Code tour (`app/src/domain/`)

This folder is the volleyball logic, with no screens or database, so it's easy to test.

| File | What it does |
|---|---|
| `types.ts` | What every event and the match state look like |
| `rules.ts` | Who gets the point; set and match win rules |
| `replay.ts` | `replay()`: plays back the events to rebuild score, server, rotation, and lineup |
| `record.ts` | `recordAction()`, `recordFollowUp()`, `recordUndo()`: turn a tap into a saved event, after checking it with `replay()` |
| `undo.ts` | `activeEvents()`: the events that still count after undos |

| `boxScore.ts` | Per-player stats counted from the events, matching the NCAA box score columns. Written test-first: the tests in `boxScore.test.ts` came before the code |

`app/src/test/matchScript.ts` is a test helper that plays out a match tap by tap, e.g. `new MatchScript().startSet().point('us', 3)`.

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
| Each event has a `seq` number | Phone clocks can give two taps the same timestamp; `seq` gives an exact order |
| Each event has an `actionId` | Groups the events from one play, so a kill and its assist score once and undo together |
| Events record the serving team and rotation at the time of the tap | The app could recompute them, but SQL in Phase 3 would have to replay the whole match. Stamping them makes "sideout % by rotation" a simple GROUP BY, and gives the Phase 3 data tests something to check |
| `replay()` throws on impossible taps, and recording checks every tap with it | One place defines the rules. A tap that breaks them is never saved |
| Rotations named by the setter's position | The convention coaches use, so rotation 3 means the same thing in every set |
| `uuid` library for ids | The browser's built-in `crypto.randomUUID()` only works on https or localhost, and testing on a phone over Wi-Fi is neither |
| React + TypeScript + Vite | Industry-standard frontend stack; TypeScript catches mistakes like a misspelled stat name before the app runs |
| Vitest for tests | Built for Vite, so tests use the same setup as the app |
| npm | Comes with Node, nothing extra to install |
| TypeScript `strict` mode on | Catches missing values (like a player with no number) at compile time |
| Line endings normalized to LF | Windows and Linux (CI in Phase 2) see identical files |
