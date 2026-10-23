import { describe, expect, it } from 'vitest'
import { HOME, MatchScript } from '../test/matchScript.ts'
import { recordUndo } from './record.ts'
import { activeEvents } from './undo.ts'

describe('activeEvents', () => {
  it('leaves out undo events and the plays they cancelled', () => {
    const match = new MatchScript().startSet().point('home').point('away').undo()
    const [setStart, homePoint] = match.events
    expect(activeEvents(match.events)).toEqual([setStart, homePoint])
  })

  it('returns events in seq order', () => {
    const match = new MatchScript().startSet().point('home', 2)
    const shuffled = [match.events[2], match.events[0], match.events[1]]
    expect(activeEvents(shuffled).map((e) => e.seq)).toEqual([1, 2, 3])
  })
})

describe('undo', () => {
  it('takes back the last point', () => {
    const state = new MatchScript().startSet().point('home', 3).undo().state()
    expect(state.sets[0]).toMatchObject({ home: 2, away: 0 })
    expect(state.rallyNumber).toBe(3)
  })

  it('goes back one more play each time', () => {
    const state = new MatchScript().startSet().point('home').point('away').undo().undo().state()
    expect(state.sets[0]).toMatchObject({ home: 0, away: 0 })
  })

  it('never deletes anything: undo adds an event', () => {
    const match = new MatchScript().startSet().point('home').undo()
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
    const state = new MatchScript().startSet({ firstServe: 'away' }).point('home').undo().state()
    expect(state.servingSide).toBe('away')
    expect(state.courts.home.lineup).toEqual(HOME)
    expect(state.courts.home.rotation).toBe(1)
  })

  it('reopens a set when its last point is undone', () => {
    const state = new MatchScript().startSet().playSetTo(25, 20).undo().state()
    expect(state.status).toBe('playing')
    expect(state.sets[0]).toEqual({ home: 24, away: 20, winner: null })
    expect(state.setsWon).toEqual({ home: 0, away: 0 })
  })

  it('keeps seq numbers going up after an undo', () => {
    const match = new MatchScript().startSet().point('home').undo().point('away')
    expect(match.events.map((e) => e.seq)).toEqual([1, 2, 3, 4])
  })

  it('stamps the next tap with the situation from before the undone play', () => {
    const match = new MatchScript().startSet().point('home').undo().point('away')
    expect(match.last()).toMatchObject({ rallyNumber: 1, servingSide: 'home' })
  })

  it('undoes a whole linked play at once', () => {
    const match = new MatchScript()
      .startSet()
      .kill('p4')
      .followUp({ type: 'assist', side: 'home', playerId: 'p1' })
      .undo()
    expect(activeEvents(match.events)).toHaveLength(1) // just the set start
    expect(match.state().sets[0]).toMatchObject({ home: 0, away: 0 })
  })
})
