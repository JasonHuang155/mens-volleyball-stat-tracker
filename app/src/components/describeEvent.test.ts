import { describe, expect, it } from 'vitest'
import type { Player } from '../domain/types.ts'
import { MatchScript } from '../test/matchScript.ts'
import { describeEvent } from './describeEvent.ts'

const players = new Map<string, Player>(
  ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].map((id, i) => [
    id,
    { id, teamId: 't', name: `Player ${i + 1}`, number: i + 1, position: 'OH' },
  ]),
)

describe('describeEvent', () => {
  it('describes player taps', () => {
    const match = new MatchScript()
      .startSet()
      .record({ type: 'serve', playerId: 'p1', result: 'ace', detail: { serveType: 'jump_spin' } })
      .kill('p4')
      .record({ type: 'block', playerId: 'p3', result: 'error' })
    expect(match.events.map((e) => describeEvent(e, players))).toEqual([
      'Set 1 started',
      '#1 Player 1: ace',
      '#4 Player 4: kill',
      '#3 Player 3: block error',
    ])
  })

  it('describes team taps, passes, and subs', () => {
    const match = new MatchScript()
      .startSet({ firstServe: 'them' })
      .record({ type: 'pass', playerId: 'p5', result: 2 })
      .point('them')
      .sub('p7', 'p2')
    expect(match.events.slice(1).map((e) => describeEvent(e, players))).toEqual([
      '#5 Player 5: pass 2',
      'Their point',
      'Sub: #7 Player 7 in for #2 Player 2',
    ])
  })
})
