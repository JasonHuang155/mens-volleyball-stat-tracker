import type { AttackBody, BlockBody, EventBody, ServeBody, Team } from './types.ts'

// The "who gets the point" table. null means the rally keeps going.
const SERVE_POINT: Record<ServeBody['result'], Team | null> = { ace: 'us', error: 'them', in: null }
const ATTACK_POINT: Record<AttackBody['result'], Team | null> = {
  kill: 'us',
  error: 'them', // includes getting blocked
  in_play: null,
}
const BLOCK_POINT: Record<BlockBody['result'], Team> = { solo: 'us', assist: 'us', error: 'them' }

/** Which team this tap gives the point to, or null if the rally keeps going. */
export function pointWinner(body: EventBody): Team | null {
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
