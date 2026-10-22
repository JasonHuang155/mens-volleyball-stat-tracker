import type { MatchState } from '../domain/types.ts'

/** One line about where a match stands, e.g. "Set 2 · 12–10" or "Won 3–1". */
export function matchSummary(state: MatchState): string {
  const sets = `${state.setsWon.us}–${state.setsWon.them}`
  if (state.status === 'finished') return `${state.winner === 'us' ? 'Won' : 'Lost'} ${sets}`
  if (state.setNumber === 0) return 'Not started'
  if (state.status === 'waiting_for_lineup') return `Sets ${sets} · set ${state.setNumber + 1} next`

  const current = state.sets[state.sets.length - 1]
  return `Set ${state.setNumber} · ${current.us}–${current.them}`
}
