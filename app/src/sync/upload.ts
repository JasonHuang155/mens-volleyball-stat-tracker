import Dexie from 'dexie'
import type { StatsDatabase, UploadedRow } from '../db/database.ts'
import type { Match, MatchEvent, Player, Team } from '../domain/types.ts'
import { ApiError } from './api.ts'

// Uploading works out what the server doesn't have yet by comparing with what was
// uploaded before, so nothing else in the app has to remember to mark changes.
// - A team, player, or match needs uploading if it's new or edited since its last upload.
// - A match's taps need uploading if they come after the last tap uploaded.
// The server skips anything it already has, so sending something twice is harmless.

/** At most this many taps per request, so one request never takes too long on a weak signal. */
export const TAPS_PER_REQUEST = 500

export type UploadBatch = { teams?: Team[]; players?: Player[]; matches?: Match[]; events?: MatchEvent[] }
/** Sends one batch to the server. Passed in, so tests can use a pretend server. */
export type SendBatch = (batch: UploadBatch) => Promise<unknown>

export type Pending = { taps: number; changes: number }

/** How much is waiting to upload: taps, and other changes (teams, players, matches). */
export async function pendingUploads(db: StatsDatabase): Promise<Pending> {
  const [changed, matches] = await Promise.all([changedRows(db), db.matches.toCollection().primaryKeys()])
  const tapCounts = await Promise.all(matches.map(async (matchId) => (await tapsToUpload(db, matchId)).count()))
  return {
    taps: tapCounts.reduce((sum, count) => sum + count, 0),
    changes: changed.teams.length + changed.players.length + changed.matches.length,
  }
}

/**
 * Uploads everything the server doesn't have yet: teams, players, and matches first
 * (taps refer to them), then each match's taps in order.
 * If the server refuses one match's taps, the other matches still upload, then that
 * refusal is thrown. Losing the connection or the login stops everything.
 */
export async function uploadPending(db: StatsDatabase, send: SendBatch): Promise<void> {
  const changed = await changedRows(db)
  if (changed.teams.length + changed.players.length + changed.matches.length > 0) {
    await send(changed)
    await db.uploadedRows.bulkPut([
      ...changed.teams.map((team) => uploadedRow('team', team)),
      ...changed.players.map((player) => uploadedRow('player', player)),
      ...changed.matches.map((match) => uploadedRow('match', match)),
    ])
  }

  let refused: ApiError | null = null
  for (const matchId of await db.matches.toCollection().primaryKeys()) {
    try {
      await uploadTaps(db, matchId, send)
    } catch (error) {
      if (!isRefusal(error)) throw error
      refused ??= error
    }
  }
  if (refused) throw refused
}

/** Forgets what was uploaded, so everything uploads again. Used when someone else logs in. */
export async function forgetUploads(db: StatsDatabase): Promise<void> {
  await Promise.all([db.uploadedRows.clear(), db.uploadedTaps.clear()])
}

async function uploadTaps(db: StatsDatabase, matchId: string, send: SendBatch): Promise<void> {
  for (;;) {
    const taps = await (await tapsToUpload(db, matchId)).limit(TAPS_PER_REQUEST).toArray()
    if (taps.length === 0) return
    await send({ events: taps })
    await db.uploadedTaps.put({ matchId, lastSeq: taps[taps.length - 1].seq })
  }
}

/** A match's taps after the last one uploaded, in order. */
async function tapsToUpload(db: StatsDatabase, matchId: string) {
  const uploaded = await db.uploadedTaps.get(matchId)
  return db.events.where('[matchId+seq]').between([matchId, (uploaded?.lastSeq ?? 0) + 1], [matchId, Dexie.maxKey])
}

/** Teams, players, and matches that are new or have changed since they were last uploaded. */
async function changedRows(db: StatsDatabase) {
  const [teams, players, matches, uploaded] = await Promise.all([
    db.teams.toArray(),
    db.players.toArray(),
    db.matches.toArray(),
    db.uploadedRows.toArray(),
  ])
  const onServer = new Map(uploaded.map((row) => [row.key, row.json]))
  const changed = <T extends { id: string }>(kind: string, rows: T[]) =>
    rows.filter((row) => onServer.get(`${kind}:${row.id}`) !== JSON.stringify(row))
  return { teams: changed('team', teams), players: changed('player', players), matches: changed('match', matches) }
}

function uploadedRow(kind: string, row: { id: string }): UploadedRow {
  // The copy that was sent. If the row was edited during the upload, it won't match, so it uploads again.
  return { key: `${kind}:${row.id}`, json: JSON.stringify(row) }
}

/** The server looked at the taps and said no (e.g. another phone recorded this match), as opposed to an outage. */
function isRefusal(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401
}
