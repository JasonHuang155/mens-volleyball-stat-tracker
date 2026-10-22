import type { AttackBody, BestOf, BlockBody, EventBody, ServeBody, Side } from './types.ts'

// The "who gets the point" table. null means the rally keeps going.
const SERVE_POINT: Record<ServeBody['result'], Side | null> = { ace: 'us', error: 'them', in: null }
const ATTACK_POINT: Record<AttackBody['result'], Side | null> = {
  kill: 'us',
  error: 'them', // includes getting blocked
  in_play: null,
}
const BLOCK_POINT: Record<BlockBody['result'], Side> = { solo: 'us', assist: 'us', error: 'them' }

/** Which team this tap gives the point to, or null if the rally keeps going. */
export function pointWinner(body: EventBody): Side | null {
  switch (body.type) {
    case 'serve':
      return SERVE_POINT[body.result]
    case 'pass':
      return body.result === 0 ? 'them' : null // a 0 pass means we got aced
    case 'attack':
      return ATTACK_POINT[body.result]
    case 'block':
      return BLOCK_POINT[body.result]
    case 'ball_handling_error':
    case 'their_point':
      return 'them'
    case 'their_error':
      return 'us'
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
export function setWinner(us: number, them: number, setNumber: number, bestOf: BestOf): Side | null {
  const target = pointsToWinSet(setNumber, bestOf)
  if (us >= target && us - them >= 2) return 'us'
  if (them >= target && them - us >= 2) return 'them'
  return null
}

/** 2 sets to win a best of 3, 3 sets to win a best of 5. */
export function setsNeededToWin(bestOf: BestOf): number {
  return Math.ceil(bestOf / 2)
}

/** Who has won the match, or null if it isn't over. */
export function matchWinner(setsWon: Record<Side, number>, bestOf: BestOf): Side | null {
  const needed = setsNeededToWin(bestOf)
  if (setsWon.us >= needed) return 'us'
  if (setsWon.them >= needed) return 'them'
  return null
}
