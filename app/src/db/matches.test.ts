import { v4 as uuidv4 } from 'uuid'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { replay } from '../domain/replay.ts'
import type { Match, Team } from '../domain/types.ts'
import { activeEvents } from '../domain/undo.ts'
import { HOME, AWAY } from '../test/matchScript.ts'
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

let dbName: string
let db: StatsDatabase
let home: Team
let away: Team
beforeEach(async () => {
  dbName = `test-${uuidv4()}`
  db = createDatabase(dbName)
  home = await createTeam(db, 'Huskies')
  away = await createTeam(db, 'Rivals')
})
afterEach(async () => {
  await db.delete()
})

async function newMatch(): Promise<Match> {
  return createMatch(db, { homeTeamId: home.id, awayTeamId: away.id, bestOf: 5 })
}

async function startedMatch(): Promise<Match> {
  const match = await newMatch()
  await recordTap(db, match, {
    type: 'set_start',
    detail: {
      home: { players: HOME, setterId: 'p1', liberoId: null },
      away: { players: AWAY, setterId: 'a1', liberoId: null },
      firstServe: 'home',
    },
  })
  return match
}

describe('matches', () => {
  it('saves a match between two teams and finds it again', async () => {
    const match = await createMatch(db, { homeTeamId: home.id, awayTeamId: away.id, bestOf: 3 })
    expect(match).toMatchObject({ homeTeamId: home.id, awayTeamId: away.id, bestOf: 3 })
    expect(await getMatch(db, match.id)).toEqual(match)
  })

  it('lists the newest match first', async () => {
    const first = await newMatch()
    await new Promise((resolve) => setTimeout(resolve, 5)) // so the timestamps differ
    const second = await newMatch()
    expect((await listMatches(db)).map((m) => m.id)).toEqual([second.id, first.id])
  })

  it('needs two different, real teams', async () => {
    await expect(createMatch(db, { homeTeamId: home.id, awayTeamId: '', bestOf: 5 })).rejects.toThrow('Pick both teams')
    await expect(createMatch(db, { homeTeamId: home.id, awayTeamId: home.id, bestOf: 5 })).rejects.toThrow(
      'Pick two different teams',
    )
    await expect(createMatch(db, { homeTeamId: home.id, awayTeamId: 'no-such-team', bestOf: 5 })).rejects.toThrow(
      'Pick both teams',
    )
  })
})

describe('saving taps', () => {
  it('saves each tap and gives them back in order', async () => {
    const match = await startedMatch()
    await recordTap(db, match, { type: 'point', side: 'home' })
    await recordTap(db, match, { type: 'dig', side: 'away', playerId: 'a5' })

    const events = await getEvents(db, match.id)
    expect(events.map((e) => e.type)).toEqual(['set_start', 'point', 'dig'])
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3])
    expect(replay(match, events).sets[0]).toMatchObject({ home: 1, away: 0 })
  })

  it('keeps every tap after the app is closed and reopened', async () => {
    const match = await startedMatch()
    await recordTap(db, match, { type: 'point', side: 'away' })
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
      side: 'home',
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
      recordTap(db, match, { type: 'point', side: 'home' }),
      recordTap(db, match, { type: 'point', side: 'away' }),
    ])
    expect((await getEvents(db, match.id)).map((e) => e.seq)).toEqual([1, 2, 3])
  })

  it('keeps each match’s taps separate', async () => {
    const a = await startedMatch()
    const b = await startedMatch()
    await recordTap(db, a, { type: 'point', side: 'home' })
    expect(await getEvents(db, a.id)).toHaveLength(2)
    expect(await getEvents(db, b.id)).toHaveLength(1)
  })

  it('saves a follow-up as part of the play', async () => {
    const match = await startedMatch()
    const ace = await recordTap(db, match, {
      type: 'serve',
      side: 'home',
      playerId: 'p1',
      result: 'ace',
      detail: { serveType: 'jump_float' },
    })
    const receptionError = await recordFollowUpTap(db, match, { type: 'pass', side: 'away', playerId: 'a5', result: 0 })
    expect(receptionError.actionId).toBe(ace.actionId)
    expect(replay(match, await getEvents(db, match.id)).sets[0]).toMatchObject({ home: 1, away: 0 })
  })

  it('undoes the last play by saving an undo event', async () => {
    const match = await startedMatch()
    await recordTap(db, match, { type: 'point', side: 'home' })
    await undoLastTap(db, match)

    const events = await getEvents(db, match.id)
    expect(events).toHaveLength(3) // nothing deleted
    expect(activeEvents(events)).toHaveLength(1)
    expect(replay(match, events).sets[0]).toMatchObject({ home: 0, away: 0 })
  })

  it('returns null when there is nothing to undo', async () => {
    const match = await newMatch()
    expect(await undoLastTap(db, match)).toBe(null)
    expect(await getEvents(db, match.id)).toEqual([])
  })
})
