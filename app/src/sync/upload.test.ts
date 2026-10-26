import { v4 as uuidv4 } from 'uuid'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database.ts'
import { createMatch, recordTap } from '../db/matches.ts'
import { updatePlayer } from '../db/roster.ts'
import type { MatchEvent } from '../domain/types.ts'
import { setUpMatch, startSet, type Fixture } from '../test/fixtures.ts'
import { ApiError, OfflineError } from './api.ts'
import { forgetUploads, pendingUploads, TAPS_PER_REQUEST, uploadPending, type UploadBatch } from './upload.ts'

// The fixtures save to the app's database, so empty it before each test.
beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

/** A pretend server that accepts every batch and remembers what it was sent. */
function acceptingServer() {
  const batches: UploadBatch[] = []
  const send = vi.fn(async (batch: UploadBatch) => {
    batches.push(structuredClone(batch))
  })
  return { batches, send }
}

/** A match with its first set started and `taps` more taps after that. */
async function matchWithTaps(taps: number): Promise<Fixture> {
  const fixture = await setUpMatch()
  await startSet(fixture)
  for (let i = 0; i < taps; i++) await recordTap(db, fixture.match, { type: 'point', side: 'home' })
  return fixture
}

// setUpMatch saves 2 teams, 16 players, and 1 match: 19 changes to upload.
const SET_UP_CHANGES = 19

describe('uploading', () => {
  it('sends teams, players, and the match first, then the taps in order', async () => {
    const fixture = await matchWithTaps(3)
    const { batches, send } = acceptingServer()
    await uploadPending(db, send)

    expect(batches).toHaveLength(2)
    expect(batches[0].teams?.map((team) => team.name).sort()).toEqual(['Huskies', 'Rivals'])
    expect(batches[0].players).toHaveLength(16)
    expect(batches[0].matches).toEqual([fixture.match])
    expect(batches[0].events).toBeUndefined()
    expect(batches[1].events?.map((tap) => tap.seq)).toEqual([1, 2, 3, 4])
  })

  it("doesn't send anything twice", async () => {
    await matchWithTaps(3)
    expect(await pendingUploads(db)).toEqual({ taps: 4, changes: SET_UP_CHANGES })
    const { send } = acceptingServer()
    await uploadPending(db, send)
    await uploadPending(db, send)

    expect(send).toHaveBeenCalledTimes(2) // both from the first upload
    expect(await pendingUploads(db)).toEqual({ taps: 0, changes: 0 })
  })

  it('sends only the taps recorded since the last upload', async () => {
    const fixture = await matchWithTaps(3)
    await uploadPending(db, acceptingServer().send)
    await recordTap(db, fixture.match, { type: 'point', side: 'away' })
    await recordTap(db, fixture.match, { type: 'point', side: 'away' })
    expect(await pendingUploads(db)).toEqual({ taps: 2, changes: 0 })

    const { batches, send } = acceptingServer()
    await uploadPending(db, send)
    expect(batches).toHaveLength(1)
    expect(batches[0].events?.map((tap) => tap.seq)).toEqual([5, 6])
  })

  it('sends an edited player again', async () => {
    const fixture = await matchWithTaps(0)
    await uploadPending(db, acceptingServer().send)
    await updatePlayer(db, { ...fixture.players.home[0], number: 99 })
    expect(await pendingUploads(db)).toEqual({ taps: 0, changes: 1 })

    const { batches, send } = acceptingServer()
    await uploadPending(db, send)
    expect(batches).toEqual([{ teams: [], players: [{ ...fixture.players.home[0], number: 99 }], matches: [] }])
  })

  it('splits a long match into several requests', async () => {
    const fixture = await matchWithTaps(0)
    await uploadPending(db, acceptingServer().send)
    const [setStart] = await db.events.toArray()
    const extra = TAPS_PER_REQUEST * 2 + 1
    await db.events.bulkAdd(
      Array.from({ length: extra }, (_, i): MatchEvent => ({ ...setStart, id: uuidv4(), seq: i + 2, type: 'point', side: 'home' })),
    )

    const { batches, send } = acceptingServer()
    await uploadPending(db, send)
    expect(batches.map((batch) => batch.events?.length)).toEqual([TAPS_PER_REQUEST, TAPS_PER_REQUEST, 1])
    expect(batches[2].events?.[0].seq).toBe(extra + 1)
    expect(fixture.match.id).toBe(batches[0].events?.[0].matchId)
  })

  it('keeps everything waiting if the connection drops', async () => {
    await matchWithTaps(3)
    const send = vi.fn().mockRejectedValue(new OfflineError())
    await expect(uploadPending(db, send)).rejects.toBeInstanceOf(OfflineError)
    expect(await pendingUploads(db)).toEqual({ taps: 4, changes: SET_UP_CHANGES })
  })

  it('remembers the part that got through before the connection dropped', async () => {
    await matchWithTaps(3)
    const send = vi.fn().mockResolvedValueOnce({}).mockRejectedValue(new OfflineError())
    await expect(uploadPending(db, send)).rejects.toBeInstanceOf(OfflineError)
    expect(await pendingUploads(db)).toEqual({ taps: 4, changes: 0 })
  })

  it("doesn't let one refused match hold up the others", async () => {
    const first = await matchWithTaps(2)
    const second = await createMatch(db, { homeTeamId: first.teams.home.id, awayTeamId: first.teams.away.id, bestOf: 3 })
    await startSet({ ...first, match: second })
    const refusal = new ApiError(409, 'Another device has already recorded taps for this match.')
    const send = vi.fn(async (batch: UploadBatch) => {
      if (batch.events?.[0].matchId === first.match.id) throw refusal
    })

    await expect(uploadPending(db, send)).rejects.toBe(refusal)
    expect(await pendingUploads(db)).toEqual({ taps: 3, changes: 0 }) // only the first match's taps are left
  })

  it('uploads everything again after forgetting what was uploaded', async () => {
    await matchWithTaps(3)
    await uploadPending(db, acceptingServer().send)
    await forgetUploads(db)
    expect(await pendingUploads(db)).toEqual({ taps: 4, changes: SET_UP_CHANGES })
  })
})
