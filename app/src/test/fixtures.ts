import { db } from '../db/database.ts'
import { createMatch, getEvents, recordTap } from '../db/matches.ts'
import { addPlayer, createTeam } from '../db/roster.ts'
import { replay } from '../domain/replay.ts'
import type { BestOf, Match, Player, Position, Side, Team } from '../domain/types.ts'

// Rosters for screen tests. In each, the first six start in positions 1-6,
// the seventh is the libero, and the eighth is on the bench.
// Home front row: #2, #3, #4. Away front row: #11, #12, #13.
export const HOME_ROSTER: [number, string, Position][] = [
  [1, 'Sam Setter', 'S'],
  [2, 'Oscar Outside', 'OH'],
  [3, 'Max Middle', 'MB'],
  [4, 'Otto Opposite', 'OPP'],
  [5, 'Olly Outside', 'OH'],
  [6, 'Mo Middle', 'MB'],
  [7, 'Lee Libero', 'L'],
  [8, 'Ben Bench', 'OH'],
]
// The away team only has jersey numbers, the way a stat crew often knows the other team.
export const AWAY_ROSTER: [number, string, Position][] = [
  [10, '', 'S'],
  [11, '', 'OH'],
  [12, '', 'MB'],
  [13, '', 'OPP'],
  [14, '', 'OH'],
  [15, '', 'MB'],
  [16, '', 'L'],
  [17, '', 'OH'],
]

export type Fixture = { match: Match; teams: Record<Side, Team>; players: Record<Side, Player[]> }

/** Saves the Huskies (home) and the Rivals (away) with their rosters, and a match between them. */
export async function setUpMatch(bestOf: BestOf = 5, awayRosterSize = AWAY_ROSTER.length): Promise<Fixture> {
  const home = await createTeam(db, 'Huskies')
  const away = await createTeam(db, 'Rivals')
  const players: Record<Side, Player[]> = { home: [], away: [] }
  for (const [number, name, position] of HOME_ROSTER) {
    players.home.push(await addPlayer(db, home.id, { number, name, position }))
  }
  for (const [number, name, position] of AWAY_ROSTER.slice(0, awayRosterSize)) {
    players.away.push(await addPlayer(db, away.id, { number, name, position }))
  }
  const match = await createMatch(db, { homeTeamId: home.id, awayTeamId: away.id, bestOf })
  return { match, teams: { home, away }, players }
}

/** Saves a set start with each team's first six in positions 1-6, their #1/#10 setting, and their liberos. */
export async function startSet({ match, players }: Fixture, firstServe: Side = 'home') {
  const lineup = (side: Side) => ({
    players: players[side].slice(0, 6).map((p) => p.id),
    setterId: players[side][0].id,
    liberoId: players[side][6].id,
  })
  await recordTap(db, match, { type: 'set_start', detail: { home: lineup('home'), away: lineup('away'), firstServe } })
}

/** Ends the current set by giving one team points with no stats until it wins the set. */
export async function giveSetTo({ match }: Fixture, side: Side) {
  const setNumber = replay(match, await getEvents(db, match.id)).setNumber
  for (;;) {
    const state = replay(match, await getEvents(db, match.id))
    if (state.status !== 'playing' || state.setNumber !== setNumber) return
    await recordTap(db, match, { type: 'point', side })
  }
}
