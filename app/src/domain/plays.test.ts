import { describe, expect, it } from 'vitest'
import { MatchScript } from '../test/matchScript.ts'
import { openQuestions } from './plays.ts'
import { recordAction } from './record.ts'
import { replay } from './replay.ts'
import type { MatchEvent, StatBody } from './types.ts'
import { activeEvents } from './undo.ts'

// Home: p1-p6 (p1 serves first, p2-p4 front row). Away: a1-a6 (a2-a4 front row).

/** The events of the most recent play. */
function lastPlay(match: MatchScript): MatchEvent[] {
  const active = activeEvents(match.events)
  const actionId = active[active.length - 1].actionId
  return active.filter((e) => e.actionId === actionId)
}

const ace = (playerId = 'p1'): StatBody => ({
  type: 'serve',
  side: 'home',
  playerId,
  result: 'ace',
  detail: { serveType: 'jump_float' },
})
const attackError = (side: 'home' | 'away', playerId: string): StatBody => ({
  type: 'attack',
  side,
  playerId,
  result: 'error',
  detail: { row: 'front' },
})

describe('kill and assist', () => {
  it('asks for the assist, then scores the play once', () => {
    const match = new MatchScript().startSet().kill('p4')
    expect(openQuestions(lastPlay(match))).toEqual([{ kind: 'assist', side: 'home' }])

    match.followUp({ type: 'assist', side: 'home', playerId: 'p1' })
    expect(openQuestions(lastPlay(match))).toEqual([])
    expect(match.state().sets[0]).toMatchObject({ home: 1, away: 0 })
    const [kill, assist] = lastPlay(match)
    expect(assist).toMatchObject({ actionId: kill.actionId, rallyNumber: kill.rallyNumber })
  })

  it('rejects an assist from the other team, a second assist, or the hitter assisting themselves', () => {
    const afterKill = () => new MatchScript().startSet().kill('p4')
    expect(() => afterKill().followUp({ type: 'assist', side: 'away', playerId: 'a1' })).toThrow(
      'an assist can only be added to a kill',
    )
    expect(() =>
      afterKill()
        .followUp({ type: 'assist', side: 'home', playerId: 'p1' })
        .followUp({ type: 'assist', side: 'home', playerId: 'p2' }),
    ).toThrow('this kill already has an assist')
    expect(() => afterKill().followUp({ type: 'assist', side: 'home', playerId: 'p4' })).toThrow(
      'that player is already part of this play',
    )
  })

  it('works after the kill that ends the set', () => {
    const match = new MatchScript().startSet().playSetTo(24, 20).kill('p4')
    expect(match.state().status).toBe('waiting_for_lineup')
    match.followUp({ type: 'assist', side: 'home', playerId: 'p1' })
    expect(match.state().sets[0]).toEqual({ home: 25, away: 20, winner: 'home' })
  })
})

describe('ace and reception error', () => {
  it('asks who was aced, and credits the receiver with a reception error', () => {
    const match = new MatchScript().startSet().record(ace())
    expect(openQuestions(lastPlay(match))).toEqual([{ kind: 'aced', side: 'away' }])

    match.followUp({ type: 'pass', side: 'away', playerId: 'a5', result: 0 })
    expect(openQuestions(lastPlay(match))).toEqual([])
    expect(match.state().sets[0]).toMatchObject({ home: 1, away: 0 }) // one point, not two
  })

  it('can start from the reception error and add the ace', () => {
    const match = new MatchScript()
      .startSet({ firstServe: 'away' })
      .record({ type: 'pass', side: 'home', playerId: 'p5', result: 0 })
      .followUp({ type: 'serve', side: 'away', playerId: 'a1', result: 'ace', detail: { serveType: 'jump_spin' } })
    expect(match.state().sets[0]).toMatchObject({ home: 0, away: 1 })
  })

  it('only pairs an ace with a reception error by the other team', () => {
    expect(() =>
      new MatchScript().startSet().record(ace()).followUp({ type: 'pass', side: 'home', playerId: 'p5', result: 0 }),
    ).toThrow('only a reception error by the other team can be added to an ace')
    expect(() =>
      new MatchScript().startSet().record(ace()).followUp({ type: 'pass', side: 'away', playerId: 'a5', result: 2 }),
    ).toThrow('only a reception error by the other team can be added to an ace')
  })
})

describe('blocked attacks', () => {
  it('asks who blocked an attack error, and one blocker is a solo block', () => {
    const match = new MatchScript().startSet().record(attackError('away', 'a4'))
    expect(openQuestions(lastPlay(match))).toEqual([{ kind: 'blockers', side: 'home' }])

    match.followUp({ type: 'block', side: 'home', playerId: 'p3', result: 'solo' })
    expect(openQuestions(lastPlay(match))).toEqual([])
    expect(match.state().sets[0]).toMatchObject({ home: 1, away: 0 })
  })

  it('gives two or three blockers a block assist each, but no more than three', () => {
    const match = new MatchScript()
      .startSet()
      .record(attackError('away', 'a4'))
      .followUp({ type: 'block', side: 'home', playerId: 'p3', result: 'assist' })
      .followUp({ type: 'block', side: 'home', playerId: 'p2', result: 'assist' })
      .followUp({ type: 'block', side: 'home', playerId: 'p4', result: 'assist' })
    expect(lastPlay(match).filter((e) => e.type === 'block')).toHaveLength(3)
    expect(() => match.followUp({ type: 'block', side: 'home', playerId: 'p5', result: 'assist' })).toThrow(
      'at most three players can block',
    )
  })

  it('doesn’t mix a solo block with block assists', () => {
    expect(() =>
      new MatchScript()
        .startSet()
        .record(attackError('away', 'a4'))
        .followUp({ type: 'block', side: 'home', playerId: 'p3', result: 'solo' })
        .followUp({ type: 'block', side: 'home', playerId: 'p2', result: 'assist' }),
    ).toThrow('a solo block has to be the only block')
  })

  it('after a solo block, asks whose attack it was', () => {
    const match = new MatchScript().startSet().record({ type: 'block', side: 'home', playerId: 'p3', result: 'solo' })
    expect(openQuestions(lastPlay(match))).toEqual([{ kind: 'attacker', side: 'away' }])
    match.followUp(attackError('away', 'a4'))
    expect(openQuestions(lastPlay(match))).toEqual([])
  })

  it('after a block assist, asks who else blocked and then whose attack it was', () => {
    const match = new MatchScript().startSet().record({ type: 'block', side: 'home', playerId: 'p3', result: 'assist' })
    expect(openQuestions(lastPlay(match))).toEqual([
      { kind: 'blockers', side: 'home' },
      { kind: 'attacker', side: 'away' },
    ])
    match.followUp({ type: 'block', side: 'home', playerId: 'p2', result: 'assist' })
    expect(openQuestions(lastPlay(match))).toEqual([{ kind: 'attacker', side: 'away' }])
    match.followUp(attackError('away', 'a4'))
    expect(openQuestions(lastPlay(match))).toEqual([])
    expect(match.state().sets[0]).toMatchObject({ home: 1, away: 0 })
  })

  it('rejects blocks that don’t fit the play', () => {
    expect(() =>
      new MatchScript()
        .startSet()
        .record(attackError('away', 'a4'))
        .followUp({ type: 'block', side: 'away', playerId: 'a3', result: 'solo' }),
    ).toThrow('blocks can only be added to an attack error or another block assist')
    expect(() =>
      new MatchScript()
        .startSet()
        .record(attackError('away', 'a4'))
        .followUp({ type: 'block', side: 'home', playerId: 'p3', result: 'error' }),
    ).toThrow('blocks can only be added to an attack error or another block assist')
  })
})

describe('plays with nothing to ask', () => {
  it('asks nothing after a dig, a serve error, or a point with no stat', () => {
    const match = new MatchScript().startSet().record({ type: 'dig', side: 'home', playerId: 'p5' })
    expect(openQuestions(lastPlay(match))).toEqual([])
    match.point('away')
    expect(openQuestions(lastPlay(match))).toEqual([])
  })

  it('needs a play to add to', () => {
    expect(() => new MatchScript().followUp({ type: 'assist', side: 'home', playerId: 'p1' })).toThrow(
      'there is no play to add to',
    )
  })

  it('never lets one play give the point to both teams', () => {
    // The app can't create this, but a damaged event list could contain it.
    const match = new MatchScript().startSet().kill('p4')
    const kill = match.last()
    const badEvent: MatchEvent = {
      ...recordAction({ id: 'match-1', bestOf: 5 }, match.events, { type: 'point', side: 'away' }),
      actionId: kill.actionId,
    }
    expect(() => replay({ bestOf: 5 }, [...match.events, badEvent])).toThrow(
      'one play can only give the point to one team',
    )
  })
})
