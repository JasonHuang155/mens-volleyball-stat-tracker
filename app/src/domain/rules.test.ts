import { describe, expect, it } from 'vitest'
import { pointWinner } from './rules.ts'
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
