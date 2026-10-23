import { describe, expect, it } from 'vitest'
import { MatchScript } from '../test/matchScript.ts'

// HOME is p1-p6 in positions 1-6, p7 is on the home bench, and L is the home libero.
// AWAY is a1-a6, a7 is on the away bench, and AL is the away libero.

describe('regular substitutions', () => {
  it('puts the new player in the same spot without changing the rotation', () => {
    const state = new MatchScript().startSet().sub('p7', 'p4').state()
    expect(state.courts.home.lineup).toEqual(['p1', 'p2', 'p3', 'p7', 'p5', 'p6'])
    expect(state.courts.home.rotation).toBe(1)
  })

  it('works for the away team too, without touching the home court', () => {
    const state = new MatchScript().startSet().sub('a7', 'a2', 'away').state()
    expect(state.courts.away.lineup).toEqual(['a1', 'a7', 'a3', 'a4', 'a5', 'a6'])
    expect(state.courts.home.lineup).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])
  })

  it('lets the sub serve once they reach position 1', () => {
    expect(new MatchScript().startSet().sub('p7', 'p1').state().serverId).toBe('p7')
  })

  it('rotates the sub like the player they replaced', () => {
    const state = new MatchScript().startSet({ firstServe: 'away' }).sub('p7', 'p2').point('home').state()
    expect(state.serverId).toBe('p7')
  })

  it('rejects subs that don’t make sense', () => {
    expect(() => new MatchScript().startSet().sub('p7', 'p8')).toThrow("the player going out isn't on court")
    expect(() => new MatchScript().startSet().sub('p3', 'p4')).toThrow('the player coming in is already on court')
    expect(() => new MatchScript().startSet().sub('a7', 'p4', 'away')).toThrow("the player going out isn't on court")
    expect(() => new MatchScript().sub('p7', 'p4')).toThrow('no set is in progress')
  })

  it('doesn’t move the libero', () => {
    expect(() => new MatchScript().startSet({ home: { liberoId: 'L' } }).sub('L', 'p5')).toThrow(
      'the libero goes in and out with a libero swap',
    )
  })
})

describe('libero swaps', () => {
  it('brings the libero in for a back-row player', () => {
    const state = new MatchScript().startSet({ home: { liberoId: 'L' } }).liberoSwap('L', 'p5').state()
    expect(state.courts.home.lineup).toEqual(['p1', 'p2', 'p3', 'p4', 'L', 'p6'])
    expect(state.courts.home.liberoReplacing).toBe('p5')
  })

  it('keeps each team’s libero separate', () => {
    const state = new MatchScript()
      .startSet({ home: { liberoId: 'L' }, away: { liberoId: 'AL' } })
      .liberoSwap('AL', 'a6', 'away')
      .state()
    expect(state.courts.away.liberoReplacing).toBe('a6')
    expect(state.courts.home.liberoReplacing).toBe(null)
  })

  it('only lets the libero replace back-row players', () => {
    expect(() => new MatchScript().startSet({ home: { liberoId: 'L' } }).liberoSwap('L', 'p3')).toThrow(
      'the libero can only replace a back-row player',
    )
  })

  it('sends the libero out for the player they replaced', () => {
    const state = new MatchScript()
      .startSet({ home: { liberoId: 'L' } })
      .liberoSwap('L', 'p5')
      .liberoSwap('p5', 'L')
      .state()
    expect(state.courts.home.lineup).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])
    expect(state.courts.home.liberoReplacing).toBe(null)
  })

  it('rejects swaps that don’t make sense', () => {
    const withLibero = () => new MatchScript().startSet({ home: { liberoId: 'L' } })
    expect(() => withLibero().liberoSwap('L', 'p5').liberoSwap('p7', 'L')).toThrow(
      'only the player the libero replaced can come back in for the libero',
    )
    expect(() => withLibero().liberoSwap('L', 'p5').liberoSwap('L', 'p6')).toThrow('the libero is already on court')
    expect(() => withLibero().liberoSwap('p5', 'L')).toThrow("the libero isn't on court")
    expect(() => new MatchScript().startSet().liberoSwap('L', 'p5')).toThrow('there is no libero this set')
  })

  it('doesn’t let the replaced player come back in for anyone else', () => {
    expect(() =>
      new MatchScript().startSet({ home: { liberoId: 'L' } }).liberoSwap('L', 'p5').sub('p5', 'p4'),
    ).toThrow('that player can only come back in for the libero')
  })

  it('brings the replaced player back when the libero would rotate to the front row', () => {
    // L replaces p1 in position 1. Each sideout moves that spot back one: 6, then 5, then 4 (front row).
    const match = new MatchScript().startSet({ home: { liberoId: 'L' }, firstServe: 'away' }).liberoSwap('L', 'p1')

    match.point('home').point('away')
    expect(match.state().courts.home.lineup).toEqual(['p2', 'p3', 'p4', 'p5', 'p6', 'L'])

    match.point('home').point('away')
    expect(match.state().courts.home.lineup).toEqual(['p3', 'p4', 'p5', 'p6', 'L', 'p2'])

    match.point('home')
    expect(match.state().courts.home.lineup).toEqual(['p4', 'p5', 'p6', 'p1', 'p2', 'p3'])
    expect(match.state().courts.home.liberoReplacing).toBe(null)
  })

  it('starts each set with the libero on the bench', () => {
    const state = new MatchScript()
      .startSet({ home: { liberoId: 'L' } })
      .liberoSwap('L', 'p5')
      .playSetTo(25, 20)
      .startSet({ home: { liberoId: 'L' } })
      .state()
    expect(state.courts.home.lineup).not.toContain('L')
    expect(state.courts.home.liberoReplacing).toBe(null)
  })
})
