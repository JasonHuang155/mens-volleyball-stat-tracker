import type { MatchState, Side } from '../domain/types.ts'

/**
 * One line about where a match stands, away team first (the way NCAA lists
 * matches: "Rivals at Huskies"). E.g. "Set 2 · 10–12" or "Huskies won 3–1".
 */
export function matchSummary(state: MatchState, teamNames: Record<Side, string>): string {
  if (state.status === 'finished' && state.winner) {
    const loser = state.winner === 'home' ? 'away' : 'home'
    return `${teamNames[state.winner]} won ${state.setsWon[state.winner]}–${state.setsWon[loser]}`
  }
  if (state.setNumber === 0) return 'Not started'
  if (state.status === 'waiting_for_lineup') {
    return `Sets ${state.setsWon.away}–${state.setsWon.home} · set ${state.setNumber + 1} next`
  }
  const current = state.sets[state.sets.length - 1]
  return `Set ${state.setNumber} · ${current.away}–${current.home}`
}
