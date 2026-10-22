import { describe, expect, it } from 'vitest'
import { LINEUP, MatchScript } from '../test/matchScript.ts'
import { recordAction, recordUndo } from './record.ts'
import { replay } from './replay.ts'
import type { MatchEvent } from './types.ts'
import { activeEvents } from './undo.ts'

describe('activeEvents', () => {
  it('leaves out undo events and the plays they cancelled', () => {
    const match = new MatchScript().startSet().point('us').point('them').undo()
    const [setStart, ourPoint] = match.events
    expect(activeEvents(match.events)).toEqual([setStart, ourPoint])
  })

  it('returns events in seq order', () => {
    const match = new MatchScript().startSet().point('us', 2)
    const shuffled = [match.events[2], match.events[0], match.events[1]]
    expect(activeEvents(shuffled).map((e) => e.seq)).toEqual([1, 2, 3])
  })
})

describe('undo', () => {
  it('takes back the last point', () => {
    const state = new MatchScript().startSet().point('us', 3).undo().state()
    expect(state.sets[0]).toMatchObject({ us: 2, them: 0 })
    expect(state.rallyNumber).toBe(3)
  })

  it('goes back one more play each time', () => {
    const state = new MatchScript().startSet().point('us').point('them').undo().undo().state()
    expect(state.sets[0]).toMatchObject({ us: 0, them: 0 })
  })

  it('never deletes anything: undo adds an event', () => {
    const match = new MatchScript().startSet().point('us').undo()
    expect(match.events).toHaveLength(3)
    expect(match.last()).toMatchObject({ type: 'undo', detail: { voidsActionId: match.events[1].actionId } })
  })

  it('returns null when there is nothing to undo', () => {
    expect(recordUndo({ id: 'match-1', bestOf: 5 }, [])).toBe(null)
    const match = new MatchScript().startSet().undo()
    expect(match.state().status).toBe('waiting_for_lineup')
    expect(recordUndo({ id: 'match-1', bestOf: 5 }, match.events)).toBe(null)
  })

  it('puts the server and rotation back after undoing a sideout', () => {
    const state = new MatchScript().startSet({ firstServe: 'them' }).point('us').undo().state()
    expect(state.servingTeam).toBe('them')
    expect(state.lineup).toEqual(LINEUP)
    expect(state.rotation).toBe(1)
  })

  it('reopens a set when its last point is undone', () => {
    const state = new MatchScript().startSet().playSetTo(25, 20).undo().state()
    expect(state.status).toBe('playing')
    expect(state.sets[0]).toEqual({ us: 24, them: 20, winner: null })
    expect(state.setsWon).toEqual({ us: 0, them: 0 })
  })

  it('keeps seq numbers going up after an undo', () => {
    const match = new MatchScript().startSet().point('us').undo().point('them')
    expect(match.events.map((e) => e.seq)).toEqual([1, 2, 3, 4])
  })

  it('stamps the next tap with the situation from before the undone play', () => {
    const match = new MatchScript().startSet().point('us').undo().point('them')
    expect(match.last()).toMatchObject({ rallyNumber: 1, servingTeam: 'us' })
  })
})

describe('follow-up taps', () => {
  it('adds the assist to the kill without scoring twice', () => {
    const match = new MatchScript().startSet().kill('p4').followUp({ type: 'assist', playerId: 'p1' })
    const [, kill, assist] = match.events
    expect(match.state().sets[0]).toMatchObject({ us: 1, them: 0 })
    expect(match.state().rallyNumber).toBe(2)
    expect(assist).toMatchObject({ actionId: kill.actionId, setNumber: 1, rallyNumber: 1 })
  })

  it('gives one point for a block with two or three blockers', () => {
    const match = new MatchScript()
      .startSet()
      .record({ type: 'block', playerId: 'p3', result: 'assist' })
      .followUp({ type: 'block', playerId: 'p2', result: 'assist' })
    expect(match.state().sets[0]).toMatchObject({ us: 1, them: 0 })

    match.followUp({ type: 'block', playerId: 'p4', result: 'assist' })
    expect(match.state().sets[0]).toMatchObject({ us: 1, them: 0 })
  })

  it('undoes the kill and its assist together', () => {
    const match = new MatchScript().startSet().kill('p4').followUp({ type: 'assist', playerId: 'p1' }).undo()
    expect(activeEvents(match.events)).toHaveLength(1) // just the set start
    expect(match.state().sets[0]).toMatchObject({ us: 0, them: 0 })
  })

  it('works after the kill that ends the set', () => {
    const match = new MatchScript().startSet().playSetTo(24, 20).kill('p4')
    expect(match.state().status).toBe('waiting_for_lineup')
    match.followUp({ type: 'assist', playerId: 'p1' })
    expect(match.state().sets[0]).toEqual({ us: 25, them: 20, winner: 'us' })
  })

  it('only adds assists to kills and block assists to block assists', () => {
    const afterDig = () => new MatchScript().startSet().record({ type: 'dig', playerId: 'p5' })
    expect(() => afterDig().followUp({ type: 'assist', playerId: 'p1' })).toThrow('an assist can only be added to a kill')

    const afterSolo = () => new MatchScript().startSet().record({ type: 'block', playerId: 'p3', result: 'solo' })
    expect(() => afterSolo().followUp({ type: 'block', playerId: 'p2', result: 'assist' })).toThrow(
      'a block assist can only be added to another block assist',
    )
  })

  it('rejects a second assist or the same player twice', () => {
    const afterKill = () => new MatchScript().startSet().kill('p4')
    expect(() =>
      afterKill().followUp({ type: 'assist', playerId: 'p1' }).followUp({ type: 'assist', playerId: 'p2' }),
    ).toThrow('this kill already has an assist')
    expect(() => afterKill().followUp({ type: 'assist', playerId: 'p4' })).toThrow(
      'that player is already part of this play',
    )
  })

  it('needs a play to add to', () => {
    expect(() => new MatchScript().followUp({ type: 'assist', playerId: 'p1' })).toThrow('there is no play to add to')
  })

  it('never lets one play give the point to both teams', () => {
    // The app can't create this, but a damaged event list could contain it.
    const match = new MatchScript().startSet().kill('p4')
    const kill = match.last()
    const badEvent: MatchEvent = {
      ...recordAction({ id: 'match-1', bestOf: 5 }, match.events, { type: 'their_point' }),
      actionId: kill.actionId,
    }
    expect(() => replay({ bestOf: 5 }, [...match.events, badEvent])).toThrow(
      'one play can only give the point to one team',
    )
  })
})
