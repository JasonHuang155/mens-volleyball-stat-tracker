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
  // (fields we look things up by). To change this later, add a version(2)
  // below instead of editing version 1, so phones with old data upgrade cleanly.
  db.version(1).stores({
    teams: 'id',
    players: 'id, teamId',
    matches: 'id, teamId, createdAt',
    events: 'id, matchId, playerId',
  })

  return db
}

/** The app's database. Tests make their own with createDatabase('some-test-name'). */
export const db = createDatabase()
