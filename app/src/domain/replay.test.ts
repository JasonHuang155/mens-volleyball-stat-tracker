import { describe, expect, it } from 'vitest'
import { LINEUP, MatchScript } from '../test/matchScript.ts'
import { courtRow } from './replay.ts'

describe('before the first set', () => {
  it('waits for a lineup', () => {
    const state = new MatchScript().state()
    expect(state.status).toBe('waiting_for_lineup')
    expect(state.setNumber).toBe(0)
    expect(state.sets).toEqual([])
    expect(state.serverId).toBe(null)
  })

  it('rejects stats until a set starts', () => {
    expect(() => new MatchScript().point('us')).toThrow('no set is in progress')
  })
})

describe('starting a set', () => {
  it('starts set 1 at 0-0 with the player in position 1 serving', () => {
    const state = new MatchScript().startSet().state()
    expect(state.status).toBe('playing')
    expect(state.setNumber).toBe(1)
    expect(state.sets).toEqual([{ us: 0, them: 0, winner: null }])
    expect(state.rallyNumber).toBe(1)
    expect(state.lineup).toEqual(LINEUP)
    expect(state.servingTeam).toBe('us')
    expect(state.serverId).toBe('p1')
  })

  it('has no server of ours when they serve first', () => {
    const state = new MatchScript().startSet({ firstServe: 'them' }).state()
    expect(state.servingTeam).toBe('them')
    expect(state.serverId).toBe(null)
  })

  it('names the rotation after the setter’s position', () => {
    expect(new MatchScript().startSet({ setterId: 'p1' }).state().rotation).toBe(1)
    expect(new MatchScript().startSet({ setterId: 'p3' }).state().rotation).toBe(3)
    expect(new MatchScript().startSet({ setterId: 'p6' }).state().rotation).toBe(6)
  })

  it('needs 6 different players', () => {
    expect(() => new MatchScript().startSet({ lineup: ['p1', 'p2', 'p3', 'p4', 'p5'] })).toThrow(
      'a lineup needs 6 different players',
    )
    expect(() =>
      new MatchScript().startSet({ lineup: ['p1', 'p1', 'p3', 'p4', 'p5', 'p6'] }),
    ).toThrow('a lineup needs 6 different players')
  })

  it('needs the setter on court and the libero on the bench', () => {
    expect(() => new MatchScript().startSet({ setterId: 'p9' })).toThrow('the setter must be in the lineup')
    expect(() => new MatchScript().startSet({ liberoId: 'p4' })).toThrow('the libero starts on the bench')
  })

  it('can’t start a set while one is being played', () => {
    expect(() => new MatchScript().startSet().startSet()).toThrow('a set is already in progress')
  })
})

describe('scoring and serving', () => {
  it('keeps the same server when the serving team wins the rally', () => {
    const state = new MatchScript().startSet().point('us', 2).state()
    expect(state.sets[0]).toMatchObject({ us: 2, them: 0 })
    expect(state.serverId).toBe('p1')
    expect(state.lineup).toEqual(LINEUP)
    expect(state.rotation).toBe(1)
  })

  it('gives the serve to them when they win our serve, without rotating us', () => {
    const state = new MatchScript().startSet().point('them').state()
    expect(state.sets[0]).toMatchObject({ us: 0, them: 1 })
    expect(state.servingTeam).toBe('them')
    expect(state.serverId).toBe(null)
    expect(state.lineup).toEqual(LINEUP)
  })

  it('rotates us when we win the serve back (a sideout)', () => {
    const state = new MatchScript().startSet({ firstServe: 'them' }).point('us').state()
    expect(state.servingTeam).toBe('us')
    expect(state.lineup).toEqual(['p2', 'p3', 'p4', 'p5', 'p6', 'p1'])
    expect(state.serverId).toBe('p2')
    expect(state.rotation).toBe(6) // the setter (p1) moved from position 1 to position 6
  })

  it('goes through rotations 6, 5, 4, 3, 2 and back to 1 after six sideouts', () => {
    const match = new MatchScript().startSet({ firstServe: 'them' })
    const rotations = []
    for (let i = 0; i < 6; i++) {
      match.point('us').point('them') // we side out, then they side out
      rotations.push(match.state().rotation)
    }
    expect(rotations).toEqual([6, 5, 4, 3, 2, 1])
    expect(match.state().lineup).toEqual(LINEUP)
  })

  it('counts rallies', () => {
    const match = new MatchScript().startSet()
    expect(match.state().rallyNumber).toBe(1)
    match.point('us').point('them').point('us')
    expect(match.state().rallyNumber).toBe(4)
  })

  it('doesn’t change the score for taps that keep the rally going', () => {
    const state = new MatchScript()
      .startSet()
      .record({ type: 'serve', playerId: 'p1', result: 'in', detail: { serveType: 'jump_float' } })
      .record({ type: 'dig', playerId: 'p5' })
      .record({ type: 'pass', playerId: 'p6', result: 2 })
      .record({ type: 'attack', playerId: 'p4', result: 'in_play', detail: { row: 'front' } })
      .state()
    expect(state.sets[0]).toMatchObject({ us: 0, them: 0 })
    expect(state.rallyNumber).toBe(1)
  })

  it('scores a kill for us and a serve error for them', () => {
    const match = new MatchScript()
      .startSet()
      .record({ type: 'attack', playerId: 'p4', result: 'kill', detail: { row: 'front' } })
    expect(match.state().sets[0]).toMatchObject({ us: 1, them: 0 })

    match.record({ type: 'serve', playerId: 'p1', result: 'error', detail: { serveType: 'jump_spin' } })
    expect(match.state().sets[0]).toMatchObject({ us: 1, them: 1 })
    expect(match.state().servingTeam).toBe('them')
  })

  it('only lets our player in position 1 serve, and only on our serve', () => {
    const serve = (playerId: string) =>
      ({ type: 'serve', playerId, result: 'in', detail: { serveType: 'jump_float' } }) as const
    expect(() => new MatchScript().startSet().record(serve('p2'))).toThrow(
      'only the player in position 1 can serve',
    )
    expect(() => new MatchScript().startSet({ firstServe: 'them' }).record(serve('p1'))).toThrow(
      "we can't serve when they're serving",
    )
  })
})

describe('ending sets and the match', () => {
  it('ends a set at 25-23', () => {
    const state = new MatchScript().startSet().playSetTo(25, 23).state()
    expect(state.sets[0]).toEqual({ us: 25, them: 23, winner: 'us' })
    expect(state.setsWon).toEqual({ us: 1, them: 0 })
    expect(state.status).toBe('waiting_for_lineup')
    expect(state.serverId).toBe(null)
  })

  it('keeps going at 25-24 until someone leads by 2', () => {
    const match = new MatchScript().startSet().playSetTo(24, 24).point('us')
    expect(match.state().status).toBe('playing')
    match.point('them').point('them').point('them')
    expect(match.state().sets[0]).toEqual({ us: 25, them: 27, winner: 'them' })
  })

  it('rejects points after the set ends until the next set starts', () => {
    const match = new MatchScript().startSet().playSetTo(25, 20)
    expect(() => match.point('us')).toThrow('no set is in progress')

    const state = match.startSet().state()
    expect(state.setNumber).toBe(2)
    expect(state.sets[1]).toEqual({ us: 0, them: 0, winner: null })
  })

  it('ends a best of 3 when a team wins 2 sets', () => {
    const match = new MatchScript(3).startSet().playSetTo(25, 20).startSet().playSetTo(25, 18)
    const state = match.state()
    expect(state.status).toBe('finished')
    expect(state.winner).toBe('us')
    expect(() => match.startSet()).toThrow('the match is over')
  })

  it('plays the deciding set to 15', () => {
    const state = new MatchScript(3)
      .startSet()
      .playSetTo(25, 20)
      .startSet()
      .playSetTo(22, 25)
      .startSet()
      .playSetTo(15, 13)
      .state()
    expect(state.sets.map((s) => s.winner)).toEqual(['us', 'them', 'us'])
    expect(state.status).toBe('finished')
    expect(state.winner).toBe('us')
  })

  it('needs 3 sets to win a best of 5', () => {
    const match = new MatchScript(5)
    for (const [us, them] of [[25, 20], [20, 25], [25, 23], [23, 25]]) {
      match.startSet().playSetTo(us, them)
    }
    expect(match.state().status).toBe('waiting_for_lineup')
    expect(match.state().setsWon).toEqual({ us: 2, them: 2 })

    match.startSet().playSetTo(13, 15)
    expect(match.state().winner).toBe('them')
  })
})

describe('recording events', () => {
  it('numbers events in order and gives each a unique id', () => {
    const match = new MatchScript().startSet().point('us', 3)
    expect(match.events.map((e) => e.seq)).toEqual([1, 2, 3, 4])
    expect(new Set(match.events.map((e) => e.id)).size).toBe(4)
    expect(match.events.every((e) => e.matchId === 'match-1')).toBe(true)
  })

  it('stamps each event with the situation at the moment of the tap', () => {
    const match = new MatchScript().startSet().point('them')
    expect(match.last()).toMatchObject({ setNumber: 1, rallyNumber: 1, servingTeam: 'us', rotation: 1 })

    match.point('us') // our sideout
    expect(match.last()).toMatchObject({ setNumber: 1, rallyNumber: 2, servingTeam: 'them', rotation: 1 })

    match.point('us')
    expect(match.last()).toMatchObject({ setNumber: 1, rallyNumber: 3, servingTeam: 'us', rotation: 6 })
  })

  it('stamps a set start with the set it begins', () => {
    const match = new MatchScript().startSet().playSetTo(25, 20).startSet({ firstServe: 'them', setterId: 'p4' })
    expect(match.last()).toMatchObject({ setNumber: 2, rallyNumber: 1, servingTeam: 'them', rotation: 4 })
  })

  it('saves nothing when a tap breaks the rules', () => {
    const match = new MatchScript().startSet({ firstServe: 'them' })
    expect(() =>
      match.record({ type: 'serve', playerId: 'p1', result: 'ace', detail: { serveType: 'jump_spin' } }),
    ).toThrow()
    expect(match.events).toHaveLength(1)
  })
})

describe('courtRow', () => {
  it('puts positions 2-4 in the front row and 1, 5, 6 in the back row', () => {
    const state = new MatchScript().startSet().state()
    expect(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((p) => courtRow(state, p))).toEqual([
      'back',
      'front',
      'front',
      'front',
      'back',
      'back',
    ])
    expect(courtRow(state, 'bench-player')).toBe(null)
  })
})
