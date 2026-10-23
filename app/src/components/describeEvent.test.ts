import { describe, expect, it } from 'vitest'
import type { Player } from '../domain/types.ts'
import { MatchScript } from '../test/matchScript.ts'
import { describeEvent } from './describeEvent.ts'

const players = new Map<string, Player>([
  ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].map(
    (id, i): [string, Player] => [id, { id, teamId: 'h', name: `Player ${i + 1}`, number: i + 1, position: 'OH' }],
  ),
  ...['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map(
    (id, i): [string, Player] => [id, { id, teamId: 'a', name: '', number: i + 10, position: 'OH' }],
  ),
])
const names = { home: 'Huskies', away: 'Rivals' }

describe('describeEvent', () => {
  it('describes player taps with the team name', () => {
    const match = new MatchScript()
      .startSet()
      .record({ type: 'serve', side: 'home', playerId: 'p1', result: 'ace', detail: { serveType: 'jump_spin' } })
      .followUp({ type: 'pass', side: 'away', playerId: 'a5', result: 0 })
      .kill('p4')
      .record({ type: 'block', side: 'home', playerId: 'p3', result: 'error' })
    expect(match.events.map((e) => describeEvent(e, players, names))).toEqual([
      'Set 1 started',
      'Huskies #1 Player 1: ace',
      'Rivals #14: reception error',
      'Huskies #4 Player 4: kill',
      'Huskies #3 Player 3: block error',
    ])
  })

  it('describes points with no stat, passes, and subs', () => {
    const match = new MatchScript()
      .startSet({ firstServe: 'away' })
      .record({ type: 'pass', side: 'home', playerId: 'p5', result: 2 })
      .point('away')
      .sub('p7', 'p2')
    expect(match.events.slice(1).map((e) => describeEvent(e, players, names))).toEqual([
      'Huskies #5 Player 5: pass 2',
      'Point to Rivals',
      'Huskies sub: #7 Player 7 in for #2 Player 2',
    ])
  })
})
