import { describe, expect, it } from 'vitest'
import { AWAY, HOME, MatchScript } from '../test/matchScript.ts'
import { courtRow } from './replay.ts'
import type { ServeBody, Side } from './types.ts'

const serve = (side: Side, playerId: string, result: ServeBody['result'] = 'in'): ServeBody => ({
  type: 'serve',
  side,
  playerId,
  result,
  detail: { serveType: 'jump_float' },
})

describe('before the first set', () => {
  it('waits for a lineup', () => {
    const state = new MatchScript().state()
    expect(state.status).toBe('waiting_for_lineup')
    expect(state.setNumber).toBe(0)
    expect(state.sets).toEqual([])
    expect(state.serverId).toBe(null)
  })

  it('rejects stats until a set starts', () => {
    expect(() => new MatchScript().point('home')).toThrow('no set is in progress')
  })
})

describe('starting a set', () => {
  it('starts set 1 at 0-0 with both lineups on court', () => {
    const state = new MatchScript().startSet().state()
    expect(state.status).toBe('playing')
    expect(state.setNumber).toBe(1)
    expect(state.sets).toEqual([{ home: 0, away: 0, winner: null }])
    expect(state.rallyNumber).toBe(1)
    expect(state.courts.home.lineup).toEqual(HOME)
    expect(state.courts.away.lineup).toEqual(AWAY)
  })

  it('has the serving team’s position 1 player serving', () => {
    expect(new MatchScript().startSet({ firstServe: 'home' }).state().serverId).toBe('p1')
    const awayFirst = new MatchScript().startSet({ firstServe: 'away' }).state()
    expect(awayFirst.servingSide).toBe('away')
    expect(awayFirst.serverId).toBe('a1')
  })

  it('names each team’s rotation after its setter’s position', () => {
    const state = new MatchScript().startSet({ home: { setterId: 'p3' }, away: { setterId: 'a6' } }).state()
    expect(state.courts.home.rotation).toBe(3)
    expect(state.courts.away.rotation).toBe(6)
  })

  it('needs 6 different players on each team', () => {
    expect(() => new MatchScript().startSet({ home: { players: ['p1', 'p2', 'p3', 'p4', 'p5'] } })).toThrow(
      'the home team needs 6 different players',
    )
    expect(() => new MatchScript().startSet({ away: { players: ['a1', 'a1', 'a3', 'a4', 'a5', 'a6'] } })).toThrow(
      'the away team needs 6 different players',
    )
  })

  it('needs each setter on court and each libero on the bench', () => {
    expect(() => new MatchScript().startSet({ home: { setterId: 'p9' } })).toThrow(
      "the home team's setter must be in the lineup",
    )
    expect(() => new MatchScript().startSet({ away: { liberoId: 'a4' } })).toThrow(
      "the away team's libero starts on the bench",
    )
  })

  it('can’t start a set while one is being played', () => {
    expect(() => new MatchScript().startSet().startSet()).toThrow('a set is already in progress')
  })
})

describe('scoring and serving', () => {
  it('keeps the same server when the serving team wins the rally', () => {
    const state = new MatchScript().startSet().point('home', 2).state()
    expect(state.sets[0]).toMatchObject({ home: 2, away: 0 })
    expect(state.serverId).toBe('p1')
    expect(state.courts.home.rotation).toBe(1)
  })

  it('rotates the team that wins the serve back (a sideout)', () => {
    const state = new MatchScript().startSet({ firstServe: 'home' }).point('away').state()
    expect(state.servingSide).toBe('away')
    expect(state.courts.away.lineup).toEqual(['a2', 'a3', 'a4', 'a5', 'a6', 'a1'])
    expect(state.serverId).toBe('a2')
    expect(state.courts.away.rotation).toBe(6) // the setter (a1) moved from position 1 to 6
    expect(state.courts.home.lineup).toEqual(HOME) // the team that lost the serve doesn't rotate
  })

  it('goes through rotations 6, 5, 4, 3, 2 and back to 1 after six sideouts', () => {
    const match = new MatchScript().startSet({ firstServe: 'away' })
    const rotations = []
    for (let i = 0; i < 6; i++) {
      match.point('home').point('away') // home sides out, then away sides out
      rotations.push(match.state().courts.home.rotation)
    }
    expect(rotations).toEqual([6, 5, 4, 3, 2, 1])
    expect(match.state().courts.home.lineup).toEqual(HOME)
  })

  it('counts rallies', () => {
    const match = new MatchScript().startSet()
    expect(match.state().rallyNumber).toBe(1)
    match.point('home').point('away').point('home')
    expect(match.state().rallyNumber).toBe(4)
  })

  it('doesn’t change the score for taps that keep the rally going', () => {
    const state = new MatchScript()
      .startSet()
      .record(serve('home', 'p1', 'in'))
      .record({ type: 'pass', side: 'away', playerId: 'a5', result: 2 })
      .record({ type: 'dig', side: 'home', playerId: 'p5' })
      .record({ type: 'attack', side: 'away', playerId: 'a4', result: 'in_play', detail: { row: 'front' } })
      .state()
    expect(state.sets[0]).toMatchObject({ home: 0, away: 0 })
    expect(state.rallyNumber).toBe(1)
  })

  it('scores taps for the right team', () => {
    const match = new MatchScript().startSet().kill('a4', 'away')
    expect(match.state().sets[0]).toMatchObject({ home: 0, away: 1 })
    match.record(serve('away', 'a2', 'error')) // a2 serves after the sideout
    expect(match.state().sets[0]).toMatchObject({ home: 1, away: 1 })
    expect(match.state().servingSide).toBe('home')
  })

  it('only lets the serving team’s position 1 player serve', () => {
    expect(() => new MatchScript().startSet().record(serve('home', 'p2'))).toThrow('only the player in position 1 can serve')
    expect(() => new MatchScript().startSet().record(serve('away', 'a1'))).toThrow("that team isn't serving")
  })

  it('only rates passes on the other team’s serve', () => {
    expect(() =>
      new MatchScript().startSet({ firstServe: 'home' }).record({ type: 'pass', side: 'home', playerId: 'p6', result: 3 }),
    ).toThrow("passes are rated on the other team's serve")
  })

  it('needs the player to be on court for their team', () => {
    expect(() => new MatchScript().startSet().kill('p4', 'away')).toThrow("that player isn't on court for their team")
    expect(() => new MatchScript().startSet().kill('p9', 'home')).toThrow("that player isn't on court for their team")
  })
})

describe('ending sets and the match', () => {
  it('ends a set at 25-23', () => {
    const state = new MatchScript().startSet().playSetTo(25, 23).state()
    expect(state.sets[0]).toEqual({ home: 25, away: 23, winner: 'home' })
    expect(state.setsWon).toEqual({ home: 1, away: 0 })
    expect(state.status).toBe('waiting_for_lineup')
    expect(state.serverId).toBe(null)
  })

  it('keeps going at 25-24 until someone leads by 2', () => {
    const match = new MatchScript().startSet().playSetTo(24, 24).point('home')
    expect(match.state().status).toBe('playing')
    match.point('away').point('away').point('away')
    expect(match.state().sets[0]).toEqual({ home: 25, away: 27, winner: 'away' })
  })

  it('rejects points after the set ends until the next set starts', () => {
    const match = new MatchScript().startSet().playSetTo(25, 20)
    expect(() => match.point('home')).toThrow('no set is in progress')

    const state = match.startSet().state()
    expect(state.setNumber).toBe(2)
    expect(state.sets[1]).toEqual({ home: 0, away: 0, winner: null })
  })

  it('ends a best of 3 when a team wins 2 sets', () => {
    const match = new MatchScript(3).startSet().playSetTo(25, 20).startSet().playSetTo(25, 18)
    expect(match.state().status).toBe('finished')
    expect(match.state().winner).toBe('home')
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
    expect(state.sets.map((s) => s.winner)).toEqual(['home', 'away', 'home'])
    expect(state.status).toBe('finished')
  })

  it('needs 3 sets to win a best of 5', () => {
    const match = new MatchScript(5)
    for (const [home, away] of [[25, 20], [20, 25], [25, 23], [23, 25]]) {
      match.startSet().playSetTo(home, away)
    }
    expect(match.state().status).toBe('waiting_for_lineup')
    match.startSet().playSetTo(13, 15)
    expect(match.state().winner).toBe('away')
  })
})

describe('recording events', () => {
  it('numbers events in order and gives each a unique id', () => {
    const match = new MatchScript().startSet().point('home', 3)
    expect(match.events.map((e) => e.seq)).toEqual([1, 2, 3, 4])
    expect(new Set(match.events.map((e) => e.id)).size).toBe(4)
    expect(match.events.every((e) => e.matchId === 'match-1')).toBe(true)
  })

  it('stamps each event with the situation at the moment of the tap, including both rotations', () => {
    const match = new MatchScript().startSet().point('away')
    expect(match.last()).toMatchObject({ setNumber: 1, rallyNumber: 1, servingSide: 'home', homeRotation: 1, awayRotation: 1 })

    match.point('home') // home sides out
    expect(match.last()).toMatchObject({ rallyNumber: 2, servingSide: 'away', homeRotation: 1, awayRotation: 6 })

    match.point('home')
    expect(match.last()).toMatchObject({ rallyNumber: 3, servingSide: 'home', homeRotation: 6, awayRotation: 6 })
  })

  it('stamps a set start with the set it begins', () => {
    const match = new MatchScript()
      .startSet()
      .playSetTo(25, 20)
      .startSet({ firstServe: 'away', home: { setterId: 'p4' }, away: { setterId: 'a2' } })
    expect(match.last()).toMatchObject({ setNumber: 2, rallyNumber: 1, servingSide: 'away', homeRotation: 4, awayRotation: 2 })
  })

  it('saves nothing when a tap breaks the rules', () => {
    const match = new MatchScript().startSet({ firstServe: 'away' })
    expect(() => match.record(serve('home', 'p1', 'ace'))).toThrow()
    expect(match.events).toHaveLength(1)
  })
})

describe('courtRow', () => {
  it('puts positions 2-4 in the front row and 1, 5, 6 in the back row, for each team', () => {
    const state = new MatchScript().startSet().state()
    expect(HOME.map((p) => courtRow(state, 'home', p))).toEqual(['back', 'front', 'front', 'front', 'back', 'back'])
    expect(courtRow(state, 'away', 'a3')).toBe('front')
    expect(courtRow(state, 'away', 'p3')).toBe(null) // p3 isn't on the away court
  })
})
