import Dexie, { type Table } from 'dexie'
import type { Match, MatchEvent, Player, Team } from '../domain/types.ts'

/**
 * The database built into the browser (IndexedDB), opened with Dexie.
 * It lives on the phone, works offline, and survives refreshes.
 */
export type StatsDatabase = Dexie & {
  teams: Table<Team, string>
  players: Table<Player, string>
  matches: Table<Match, string>
  events: Table<MatchEvent, string>
}

export function createDatabase(name = 'volleyball-stats'): StatsDatabase {
  const db = new Dexie(name) as StatsDatabase

  // For each table: the first name is the primary key, the rest are indexes
  // (fields we look things up by). To change the tables, add a new version
  // below instead of editing an old one, so phones with old data upgrade cleanly.
  db.version(1).stores({
    teams: 'id',
    players: 'id, teamId',
    matches: 'id, teamId, createdAt',
    events: 'id, matchId, playerId',
  })

  // Version 2: matches have a home and an away team, and events say which side
  // they belong to. Matches saved by version 1 only tracked one team and can't
  // be converted, so they're cleared. (They were test data from building the app.)
  db.version(2)
    .stores({ matches: 'id, homeTeamId, awayTeamId, createdAt' })
    .upgrade(async (tx) => {
      await tx.table('matches').clear()
      await tx.table('events').clear()
    })

  return db
}

/** The app's database. Tests make their own with createDatabase('some-test-name'). */
export const db = createDatabase()
