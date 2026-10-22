import { v4 as uuidv4 } from 'uuid'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { replay } from '../domain/replay.ts'
import type { Match, Team } from '../domain/types.ts'
import { activeEvents } from '../domain/undo.ts'
import { createDatabase, type StatsDatabase } from './database.ts'
import {
  createMatch,
  getEvents,
  getMatch,
  listMatches,
  recordFollowUpTap,
  recordTap,
  undoLastTap,
} from './matches.ts'
import { createTeam } from './roster.ts'

const LINEUP = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']

let dbName: string
let db: StatsDatabase
let team: Team
beforeEach(async () => {
  dbName = `test-${uuidv4()}`
  db = createDatabase(dbName)
  team = await createTeam(db, 'Huskies')
})
afterEach(async () => {
  await db.delete()
})

async function startedMatch(): Promise<Match> {
  const match = await createMatch(db, { teamId: team.id, opponentName: 'Rivals', bestOf: 5 })
  await recordTap(db, match, {
    type: 'set_start',
    detail: { lineup: LINEUP, setterId: 'p1', liberoId: null, firstServe: 'us' },
  })
  return match
}

describe('matches', () => {
  it('saves a match and finds it again', async () => {
    const match = await createMatch(db, { teamId: team.id, opponentName: ' Rivals ', bestOf: 3 })
    expect(match).toMatchObject({ teamId: team.id, opponentName: 'Rivals', bestOf: 3 })
    expect(await getMatch(db, match.id)).toEqual(match)
  })

  it('lists the newest match first', async () => {
    const first = await createMatch(db, { teamId: team.id, opponentName: 'First', bestOf: 5 })
    await new Promise((resolve) => setTimeout(resolve, 5)) // so the timestamps differ
    const second = await createMatch(db, { teamId: team.id, opponentName: 'Second', bestOf: 5 })
    expect((await listMatches(db)).map((m) => m.id)).toEqual([second.id, first.id])
  })

  it('needs an opponent and a real team', async () => {
    await expect(createMatch(db, { teamId: team.id, opponentName: '', bestOf: 5 })).rejects.toThrow(
      'Enter the opponent’s name',
    )
    await expect(createMatch(db, { teamId: 'no-such-team', opponentName: 'Rivals', bestOf: 5 })).rejects.toThrow(
      'Pick a team first',
    )
  })
})

describe('saving taps', () => {
  it('saves each tap and gives them back in order', async () => {
    const match = await startedMatch()
    await recordTap(db, match, { type: 'their_error' })
    await recordTap(db, match, { type: 'dig', playerId: 'p5' })

    const events = await getEvents(db, match.id)
    expect(events.map((e) => e.type)).toEqual(['set_start', 'their_error', 'dig'])
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3])
    expect(replay(match, events).sets[0]).toMatchObject({ us: 1, them: 0 })
  })

  it('keeps every tap after the app is closed and reopened', async () => {
    const match = await startedMatch()
    await recordTap(db, match, { type: 'their_point' })
    db.close()

    const reopened = createDatabase(dbName) // what happens when the page refreshes
    expect(await getEvents(reopened, match.id)).toHaveLength(2)
    reopened.close()
    db = createDatabase(dbName) // so afterEach can delete it
  })

  it('saves nothing when a tap breaks the rules', async () => {
    const match = await startedMatch()
    const serveByWrongPlayer = recordTap(db, match, {
      type: 'serve',
      playerId: 'p2',
      result: 'ace',
      detail: { serveType: 'jump_spin' },
    })
    await expect(serveByWrongPlayer).rejects.toThrow('only the player in position 1 can serve')
    expect(await getEvents(db, match.id)).toHaveLength(1)
  })

  it('gives two taps made at the same moment different seq numbers', async () => {
    const match = await startedMatch()
    await Promise.all([
      recordTap(db, match, { type: 'their_error' }),
      recordTap(db, match, { type: 'their_point' }),
    ])
    expect((await getEvents(db, match.id)).map((e) => e.seq)).toEqual([1, 2, 3])
  })

  it('keeps each match’s taps separate', async () => {
    const a = await startedMatch()
    const b = await startedMatch()
    await recordTap(db, a, { type: 'their_error' })
    expect(await getEvents(db, a.id)).toHaveLength(2)
    expect(await getEvents(db, b.id)).toHaveLength(1)
  })

  it('saves a follow-up as part of the play', async () => {
    const match = await startedMatch()
    const kill = await recordTap(db, match, {
      type: 'attack',
      playerId: 'p4',
      result: 'kill',
      detail: { row: 'front' },
    })
    const assist = await recordFollowUpTap(db, match, { type: 'assist', playerId: 'p1' })
    expect(assist.actionId).toBe(kill.actionId)
    expect(replay(match, await getEvents(db, match.id)).sets[0]).toMatchObject({ us: 1, them: 0 })
  })

  it('undoes the last play by saving an undo event', async () => {
    const match = await startedMatch()
    await recordTap(db, match, { type: 'their_error' })
    await undoLastTap(db, match)

    const events = await getEvents(db, match.id)
    expect(events).toHaveLength(3) // nothing deleted
    expect(activeEvents(events)).toHaveLength(1)
    expect(replay(match, events).sets[0]).toMatchObject({ us: 0, them: 0 })
  })

  it('returns null when there is nothing to undo', async () => {
    const match = await createMatch(db, { teamId: team.id, opponentName: 'Rivals', bestOf: 5 })
    expect(await undoLastTap(db, match)).toBe(null)
    expect(await getEvents(db, match.id)).toEqual([])
  })
})
