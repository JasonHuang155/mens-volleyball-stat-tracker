import { describe, expect, it } from 'vitest'
import { MatchScript } from '../test/matchScript.ts'
import { matchSummary } from './matchSummary.ts'

describe('matchSummary', () => {
  it('says when a match hasn’t started', () => {
    expect(matchSummary(new MatchScript().state())).toBe('Not started')
  })

  it('shows the score of the set being played', () => {
    expect(matchSummary(new MatchScript().startSet().point('us', 12).point('them', 10).state())).toBe('Set 1 · 12–10')
  })

  it('shows the sets so far between sets', () => {
    expect(matchSummary(new MatchScript().startSet().playSetTo(25, 20).state())).toBe('Sets 1–0 · set 2 next')
  })

  it('shows who won', () => {
    const won = new MatchScript(3).startSet().playSetTo(25, 20).startSet().playSetTo(25, 22)
    expect(matchSummary(won.state())).toBe('Won 2–0')

    const lost = new MatchScript(3).startSet().playSetTo(20, 25).startSet().playSetTo(22, 25)
    expect(matchSummary(lost.state())).toBe('Lost 0–2')
  })
})
