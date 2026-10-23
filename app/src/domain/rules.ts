import type { AttackBody, BestOf, BlockBody, EventBody, ServeBody, Side } from './types.ts'

export function otherSide(side: Side): Side {
  return side === 'home' ? 'away' : 'home'
}

// The "who gets the point" table, from the point of view of the player's own team.
// 'own' = their team wins the point, 'other' = the other team does, null = the rally keeps going.
type Outcome = 'own' | 'other' | null
const SERVE: Record<ServeBody['result'], Outcome> = { ace: 'own', error: 'other', in: null }
const ATTACK: Record<AttackBody['result'], Outcome> = {
  kill: 'own',
  error: 'other', // includes getting blocked
  in_play: null,
}
const BLOCK: Record<BlockBody['result'], Outcome> = { solo: 'own', assist: 'own', error: 'other' }

/** Which team this tap gives the point to, or null if the rally keeps going. */
export function pointWinner(body: EventBody): Side | null {
  const outcome = outcomeOf(body)
  if (outcome === null || !('side' in body)) return null
  return outcome === 'own' ? body.side : otherSide(body.side)
}

function outcomeOf(body: EventBody): Outcome {
  switch (body.type) {
    case 'serve':
      return SERVE[body.result]
    case 'pass':
      return body.result === 0 ? 'other' : null // a 0 pass means they got aced
    case 'attack':
      return ATTACK[body.result]
    case 'block':
      return BLOCK[body.result]
    case 'ball_handling_error':
      return 'other'
    case 'point':
      return 'own'
    default:
      return null // dig, assist, set_start, substitution, undo
  }
}

/** The last possible set (set 3 of a best of 3, set 5 of a best of 5) is the deciding set. */
export function isDecidingSet(setNumber: number, bestOf: BestOf): boolean {
  return setNumber === bestOf
}

/** Sets go to 25, except the deciding set, which goes to 15. */
export function pointsToWinSet(setNumber: number, bestOf: BestOf): number {
  return isDecidingSet(setNumber, bestOf) ? 15 : 25
}

/** Who has won the set at this score, or null if it isn't over. You must win by 2. */
export function setWinner(home: number, away: number, setNumber: number, bestOf: BestOf): Side | null {
  const target = pointsToWinSet(setNumber, bestOf)
  if (home >= target && home - away >= 2) return 'home'
  if (away >= target && away - home >= 2) return 'away'
  return null
}

/** 2 sets to win a best of 3, 3 sets to win a best of 5. */
export function setsNeededToWin(bestOf: BestOf): number {
  return Math.ceil(bestOf / 2)
}

/** Who has won the match, or null if it isn't over. */
export function matchWinner(setsWon: Record<Side, number>, bestOf: BestOf): Side | null {
  const needed = setsNeededToWin(bestOf)
  if (setsWon.home >= needed) return 'home'
  if (setsWon.away >= needed) return 'away'
  return null
}
