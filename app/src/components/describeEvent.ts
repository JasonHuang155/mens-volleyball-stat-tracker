import type { MatchEvent, Player } from '../domain/types.ts'

const RESULT_TEXT: Record<string, Record<string, string>> = {
  serve: { ace: 'ace', error: 'serve error', in: 'serve in' },
  attack: { kill: 'kill', error: 'attack error', in_play: 'attack in play' },
  block: { solo: 'solo block', assist: 'block assist', error: 'block error' },
}

/** A short description of a tap, e.g. "#4 Otto: kill", so the stat keeper can see it registered. */
export function describeEvent(event: MatchEvent, playersById: Map<string, Player>): string {
  const who = (id: string) => {
    const player = playersById.get(id)
    return player ? `#${player.number} ${player.name}` : 'Unknown player'
  }

  switch (event.type) {
    case 'serve':
    case 'attack':
    case 'block':
      return `${who(event.playerId)}: ${RESULT_TEXT[event.type][event.result]}`
    case 'pass':
      return `${who(event.playerId)}: pass ${event.result}`
    case 'dig':
      return `${who(event.playerId)}: dig`
    case 'assist':
      return `${who(event.playerId)}: assist`
    case 'ball_handling_error':
      return `${who(event.playerId)}: ball handling error`
    case 'their_point':
      return 'Their point'
    case 'their_error':
      return 'Their error'
    case 'set_start':
      return `Set ${event.setNumber} started`
    case 'substitution': {
      const swap = `${who(event.playerId)} in for ${who(event.detail.playerOutId)}`
      return event.detail.kind === 'libero' ? `Libero swap: ${swap}` : `Sub: ${swap}`
    }
    case 'undo':
      return 'Undo'
  }
}
