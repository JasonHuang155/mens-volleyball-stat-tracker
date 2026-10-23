import { describe, expect, it } from 'vitest'
import { MatchScript } from '../test/matchScript.ts'
import { matchSummary } from './matchSummary.ts'

const names = { home: 'Huskies', away: 'Rivals' }

describe('matchSummary', () => {
  it('says when a match hasn’t started', () => {
    expect(matchSummary(new MatchScript().state(), names)).toBe('Not started')
  })

  it('shows the score of the set being played, away team first', () => {
    const state = new MatchScript().startSet().point('home', 12).point('away', 10).state()
    expect(matchSummary(state, names)).toBe('Set 1 · 10–12')
  })

  it('shows the sets so far between sets', () => {
    expect(matchSummary(new MatchScript().startSet().playSetTo(25, 20).state(), names)).toBe('Sets 0–1 · set 2 next')
  })

  it('shows who won', () => {
    const homeWin = new MatchScript(3).startSet().playSetTo(25, 20).startSet().playSetTo(25, 22)
    expect(matchSummary(homeWin.state(), names)).toBe('Huskies won 2–0')

    const awayWin = new MatchScript(3).startSet().playSetTo(20, 25).startSet().playSetTo(22, 25)
    expect(matchSummary(awayWin.state(), names)).toBe('Rivals won 2–0')
  })
})
