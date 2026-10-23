import { describe, expect, it } from 'vitest'
import {
  isDecidingSet,
  matchWinner,
  otherSide,
  pointsToWinSet,
  pointWinner,
  setsNeededToWin,
  setWinner,
} from './rules.ts'
import type { EventBody, Side } from './types.ts'

describe('pointWinner', () => {
  const side = 'home' as const
  const p = 'p1'
  // All for a home player: "home" means the home team wins the point.
  const cases: [string, EventBody, Side | null][] = [
    ['serve ace', { type: 'serve', side, playerId: p, result: 'ace', detail: { serveType: 'jump_spin' } }, 'home'],
    ['serve error', { type: 'serve', side, playerId: p, result: 'error', detail: { serveType: 'jump_float' } }, 'away'],
    ['serve in', { type: 'serve', side, playerId: p, result: 'in', detail: { serveType: 'standing_float' } }, null],
    ['pass 0 (aced)', { type: 'pass', side, playerId: p, result: 0 }, 'away'],
    ['pass 1', { type: 'pass', side, playerId: p, result: 1 }, null],
    ['pass 3', { type: 'pass', side, playerId: p, result: 3 }, null],
    ['kill', { type: 'attack', side, playerId: p, result: 'kill', detail: { row: 'front' } }, 'home'],
    ['attack error', { type: 'attack', side, playerId: p, result: 'error', detail: { row: 'back' } }, 'away'],
    ['attack in play', { type: 'attack', side, playerId: p, result: 'in_play', detail: { row: 'front' } }, null],
    ['block solo', { type: 'block', side, playerId: p, result: 'solo' }, 'home'],
    ['block assist', { type: 'block', side, playerId: p, result: 'assist' }, 'home'],
    ['block error', { type: 'block', side, playerId: p, result: 'error' }, 'away'],
    ['dig', { type: 'dig', side, playerId: p }, null],
    ['assist', { type: 'assist', side, playerId: p }, null],
    ['ball handling error', { type: 'ball_handling_error', side, playerId: p }, 'away'],
    ['point, no stat', { type: 'point', side }, 'home'],
    ['undo', { type: 'undo', detail: { voidsActionId: 'a1' } }, null],
  ]

  it.each(cases)('%s', (_label, body, expected) => {
    expect(pointWinner(body)).toBe(expected)
  })

  it('works the same way for the away team', () => {
    expect(pointWinner({ type: 'attack', side: 'away', playerId: 'a4', result: 'kill', detail: { row: 'front' } })).toBe(
      'away',
    )
    expect(pointWinner({ type: 'pass', side: 'away', playerId: 'a5', result: 0 })).toBe('home')
    expect(pointWinner({ type: 'point', side: 'away' })).toBe('away')
  })
})

describe('otherSide', () => {
  it('swaps home and away', () => {
    expect(otherSide('home')).toBe('away')
    expect(otherSide('away')).toBe('home')
  })
})

describe('deciding set', () => {
  it('is the last possible set', () => {
    expect(isDecidingSet(5, 5)).toBe(true)
    expect(isDecidingSet(4, 5)).toBe(false)
    expect(isDecidingSet(3, 3)).toBe(true)
    expect(isDecidingSet(3, 5)).toBe(false)
  })

  it('goes to 15 instead of 25', () => {
    expect(pointsToWinSet(1, 5)).toBe(25)
    expect(pointsToWinSet(4, 5)).toBe(25)
    expect(pointsToWinSet(5, 5)).toBe(15)
    expect(pointsToWinSet(2, 3)).toBe(25)
    expect(pointsToWinSet(3, 3)).toBe(15)
  })
})

describe('setWinner', () => {
  const cases: [number, number, number, Side | null][] = [
    // [home, away, setNumber, expected] in a best of 5
    [25, 23, 1, 'home'],
    [23, 25, 1, 'away'],
    [25, 0, 1, 'home'],
    [25, 24, 1, null], // must win by 2
    [24, 24, 1, null],
    [26, 24, 1, 'home'],
    [31, 33, 1, 'away'], // no cap on extra points
    [24, 22, 1, null], // haven't reached 25
    [15, 13, 5, 'home'], // deciding set goes to 15
    [14, 12, 5, null],
    [15, 14, 5, null],
    [17, 15, 5, 'home'],
    [15, 13, 4, null], // set 4 still goes to 25
  ]

  it.each(cases)('%i-%i in set %i → %s', (home, away, setNumber, expected) => {
    expect(setWinner(home, away, setNumber, 5)).toBe(expected)
  })

  it('uses 15 for set 3 of a best of 3', () => {
    expect(setWinner(15, 10, 3, 3)).toBe('home')
    expect(setWinner(15, 10, 2, 3)).toBe(null)
  })
})

describe('matchWinner', () => {
  it('needs 2 sets in a best of 3 and 3 in a best of 5', () => {
    expect(setsNeededToWin(3)).toBe(2)
    expect(setsNeededToWin(5)).toBe(3)
  })

  it('finds the winner once a team has enough sets', () => {
    expect(matchWinner({ home: 3, away: 1 }, 5)).toBe('home')
    expect(matchWinner({ home: 0, away: 2 }, 3)).toBe('away')
  })

  it('returns null while the match is still going', () => {
    expect(matchWinner({ home: 2, away: 2 }, 5)).toBe(null)
    expect(matchWinner({ home: 1, away: 1 }, 3)).toBe(null)
    expect(matchWinner({ home: 2, away: 0 }, 5)).toBe(null)
  })
})
