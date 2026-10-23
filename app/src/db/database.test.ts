import Dexie from 'dexie'
import { v4 as uuidv4 } from 'uuid'
import { describe, expect, it } from 'vitest'
import { createDatabase } from './database.ts'

describe('upgrading from the one-team version', () => {
  it('clears old matches and taps, but keeps teams and players', async () => {
    const name = `test-${uuidv4()}`
    // A browser that still has the version 1 database, from before both teams were tracked.
    const old = new Dexie(name)
    old.version(1).stores({ teams: 'id', players: 'id, teamId', matches: 'id, teamId, createdAt', events: 'id, matchId, playerId' })
    await old.table('teams').add({ id: 't1', name: 'Huskies' })
    await old.table('players').add({ id: 'p1', teamId: 't1', name: 'Sam', number: 1, position: 'S' })
    await old.table('matches').add({ id: 'm1', teamId: 't1', opponentName: 'Rivals', bestOf: 5, createdAt: '2026-10-22' })
    await old.table('events').add({ id: 'e1', matchId: 'm1', seq: 1 })
    old.close()

    const db = createDatabase(name)
    expect(await db.matches.count()).toBe(0)
    expect(await db.events.count()).toBe(0)
    expect(await db.teams.count()).toBe(1)
    expect(await db.players.count()).toBe(1)
    await db.delete()
  })
})
