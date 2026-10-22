import { describe, expect, it } from 'vitest'
import {
  isDecidingSet,
  matchWinner,
  pointsToWinSet,
  pointWinner,
  setsNeededToWin,
  setWinner,
} from './rules.ts'
import type { EventBody, Team } from './types.ts'

describe('pointWinner', () => {
  const p = 'p1'
  const cases: [string, EventBody, Team | null][] = [
    ['serve ace', { type: 'serve', playerId: p, result: 'ace', detail: { serveType: 'jump_spin' } }, 'us'],
    ['serve error', { type: 'serve', playerId: p, result: 'error', detail: { serveType: 'jump_float' } }, 'them'],
    ['serve in', { type: 'serve', playerId: p, result: 'in', detail: { serveType: 'standing_float' } }, null],
    ['pass 0 (aced)', { type: 'pass', playerId: p, result: 0 }, 'them'],
    ['pass 1', { type: 'pass', playerId: p, result: 1 }, null],
    ['pass 3', { type: 'pass', playerId: p, result: 3 }, null],
    ['kill', { type: 'attack', playerId: p, result: 'kill', detail: { row: 'front' } }, 'us'],
    ['attack error', { type: 'attack', playerId: p, result: 'error', detail: { row: 'back' } }, 'them'],
    ['attack in play', { type: 'attack', playerId: p, result: 'in_play', detail: { row: 'front' } }, null],
    ['block solo', { type: 'block', playerId: p, result: 'solo' }, 'us'],
    ['block assist', { type: 'block', playerId: p, result: 'assist' }, 'us'],
    ['block error', { type: 'block', playerId: p, result: 'error' }, 'them'],
    ['dig', { type: 'dig', playerId: p }, null],
    ['assist', { type: 'assist', playerId: p }, null],
    ['ball handling error', { type: 'ball_handling_error', playerId: p }, 'them'],
    ['their point', { type: 'their_point' }, 'them'],
    ['their error', { type: 'their_error' }, 'us'],
    ['undo', { type: 'undo', detail: { voidsActionId: 'a1' } }, null],
  ]

  it.each(cases)('%s', (_label, body, expected) => {
    expect(pointWinner(body)).toBe(expected)
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
  const cases: [number, number, number, Team | null][] = [
    // [us, them, setNumber, expected] in a best of 5
    [25, 23, 1, 'us'],
    [23, 25, 1, 'them'],
    [25, 0, 1, 'us'],
    [25, 24, 1, null], // must win by 2
    [24, 24, 1, null],
    [26, 24, 1, 'us'],
    [31, 33, 1, 'them'], // no cap on extra points
    [24, 22, 1, null], // haven't reached 25
    [15, 13, 5, 'us'], // deciding set goes to 15
    [14, 12, 5, null],
    [15, 14, 5, null],
    [17, 15, 5, 'us'],
    [15, 13, 4, null], // set 4 still goes to 25
  ]

  it.each(cases)('%i-%i in set %i → %s', (us, them, setNumber, expected) => {
    expect(setWinner(us, them, setNumber, 5)).toBe(expected)
  })

  it('uses 15 for set 3 of a best of 3', () => {
    expect(setWinner(15, 10, 3, 3)).toBe('us')
    expect(setWinner(15, 10, 2, 3)).toBe(null)
  })
})

describe('matchWinner', () => {
  it('needs 2 sets in a best of 3 and 3 in a best of 5', () => {
    expect(setsNeededToWin(3)).toBe(2)
    expect(setsNeededToWin(5)).toBe(3)
  })

  it('finds the winner once a team has enough sets', () => {
    expect(matchWinner({ us: 3, them: 1 }, 5)).toBe('us')
    expect(matchWinner({ us: 0, them: 2 }, 3)).toBe('them')
  })

  it('returns null while the match is still going', () => {
    expect(matchWinner({ us: 2, them: 2 }, 5)).toBe(null)
    expect(matchWinner({ us: 1, them: 1 }, 3)).toBe(null)
    expect(matchWinner({ us: 2, them: 0 }, 5)).toBe(null)
  })
})
