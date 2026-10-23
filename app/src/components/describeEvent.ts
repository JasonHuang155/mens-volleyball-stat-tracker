import { playerLabel } from '../db/roster.ts'
import type { MatchEvent, Player, Side } from '../domain/types.ts'

const RESULT_TEXT: Record<string, Record<string, string>> = {
  serve: { ace: 'ace', error: 'serve error', in: 'serve in' },
  attack: { kill: 'kill', error: 'attack error', in_play: 'attack in play' },
  block: { solo: 'solo block', assist: 'block assist', error: 'block error' },
}

/**
 * A short description of a tap, e.g. "Huskies #4 Otto: kill", so the stat
 * keeper can see it registered.
 */
export function describeEvent(
  event: MatchEvent,
  playersById: Map<string, Player>,
  teamNames: Record<Side, string>,
): string {
  const who = (side: Side, id: string) => {
    const player = playersById.get(id)
    return `${teamNames[side]} ${player ? playerLabel(player) : 'unknown player'}`
  }

  switch (event.type) {
    case 'serve':
    case 'attack':
    case 'block':
      return `${who(event.side, event.playerId)}: ${RESULT_TEXT[event.type][event.result]}`
    case 'pass':
      return `${who(event.side, event.playerId)}: ${event.result === 0 ? 'reception error' : `pass ${event.result}`}`
    case 'dig':
      return `${who(event.side, event.playerId)}: dig`
    case 'assist':
      return `${who(event.side, event.playerId)}: assist`
    case 'ball_handling_error':
      return `${who(event.side, event.playerId)}: ball handling error`
    case 'point':
      return `Point to ${teamNames[event.side]}`
    case 'set_start':
      return `Set ${event.setNumber} started`
    case 'substitution': {
      const playerIn = playersById.get(event.playerId)
      const playerOut = playersById.get(event.detail.playerOutId)
      const swap = `${playerIn ? playerLabel(playerIn) : '?'} in for ${playerOut ? playerLabel(playerOut) : '?'}`
      return `${teamNames[event.side]} ${event.detail.kind === 'libero' ? 'libero swap' : 'sub'}: ${swap}`
    }
    case 'undo':
      return 'Undo'
  }
}
