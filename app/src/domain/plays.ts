import { otherSide } from './rules.ts'
import type { MatchEvent, Side, StatBody } from './types.ts'
import { activeEvents } from './undo.ts'

// A "play" is the events that share one actionId. Many plays involve both teams,
// and an NCAA stat sheet credits both: an ace is also a reception error, and a
// blocked attack is an attack error plus a block. The first tap scores the point;
// the taps added to it (follow-ups) only give players credit.

/** A question the tap screen asks after a play, to fill in the other players involved. */
export type Question =
  /** "Assist by?" after a kill: a teammate of the hitter. */
  | { kind: 'assist'; side: Side }
  /** "Who was aced?" after an ace: a player on the receiving team. */
  | { kind: 'aced'; side: Side }
  /** "Blocked by?" after an attack error, or "Who else blocked?" after a block assist. Pick one or more. */
  | { kind: 'blockers'; side: Side }
  /** "Whose attack?" after a block: the hitter on the other team. */
  | { kind: 'attacker'; side: Side }

/** The questions still open for a play, in the order to ask them. */
export function openQuestions(play: MatchEvent[]): Question[] {
  const first = play[0]
  if (!first || !('playerId' in first)) return []
  const has = (type: MatchEvent['type']) => play.some((e) => e.type === type)
  const blocks = play.filter((e) => e.type === 'block').length

  if (first.type === 'attack' && first.result === 'kill') {
    return has('assist') ? [] : [{ kind: 'assist', side: first.side }]
  }
  if (first.type === 'serve' && first.result === 'ace') {
    return has('pass') ? [] : [{ kind: 'aced', side: otherSide(first.side) }]
  }
  if (first.type === 'attack' && first.result === 'error') {
    return blocks > 0 ? [] : [{ kind: 'blockers', side: otherSide(first.side) }]
  }
  if (first.type === 'block' && first.result !== 'error') {
    const questions: Question[] = []
    if (first.result === 'assist' && blocks === 1) questions.push({ kind: 'blockers', side: first.side })
    if (!has('attack')) questions.push({ kind: 'attacker', side: otherSide(first.side) })
    return questions
  }
  return []
}

/** The events of one play (one actionId), in order. */
export function playEvents(events: MatchEvent[], actionId: string): MatchEvent[] {
  return activeEvents(events).filter((e) => e.actionId === actionId)
}

/** The next question to ask about a play, leaving out the kinds the stat keeper skipped. */
export function nextQuestion(
  events: MatchEvent[],
  actionId: string,
  skipped: Question['kind'][],
): Question | undefined {
  return openQuestions(playEvents(events, actionId)).find((q) => !skipped.includes(q.kind))
}

/**
 * Why this tap can't be added to the play, or null if it can.
 * The rules follow how NCAA stat sheets pair stats up.
 */
export function followUpProblem(play: MatchEvent[], body: StatBody): string | null {
  const first = play[0]
  if (!first) return 'there is no play to add to'
  if (!('playerId' in body) || !('playerId' in first)) return "that can't be added to this play"
  if (play.some((e) => 'playerId' in e && e.playerId === body.playerId)) return 'that player is already part of this play'

  const sameTeam = body.side === first.side
  const count = (type: MatchEvent['type']) => play.filter((e) => e.type === type).length

  switch (body.type) {
    case 'assist':
      if (!(first.type === 'attack' && first.result === 'kill' && sameTeam)) return 'an assist can only be added to a kill'
      if (count('assist') > 0) return 'this kill already has an assist'
      return null

    case 'pass':
      // A reception error is the other half of an ace.
      if (!(body.result === 0 && first.type === 'serve' && first.result === 'ace' && !sameTeam)) {
        return 'only a reception error by the other team can be added to an ace'
      }
      if (count('pass') > 0) return 'this ace already has a reception error'
      return null

    case 'serve':
      // And an ace is the other half of a reception error.
      if (!(body.result === 'ace' && first.type === 'pass' && first.result === 0 && !sameTeam)) {
        return 'only an ace by the other team can be added to a reception error'
      }
      if (count('serve') > 0) return 'this reception error already has an ace'
      return null

    case 'attack':
      // A blocked attack is an attack error for the hitter.
      if (!(body.result === 'error' && first.type === 'block' && first.result !== 'error' && !sameTeam)) {
        return 'only an attack error by the other team can be added to a block'
      }
      if (count('attack') > 0) return 'this block already has an attack'
      return null

    case 'block': {
      const blocks = play.filter((e) => e.type === 'block')
      const blockedAttack = first.type === 'attack' && first.result === 'error' && !sameTeam
      const moreBlockers = first.type === 'block' && first.result === 'assist' && sameTeam
      if (body.result === 'error' || !(blockedAttack || moreBlockers)) {
        return 'blocks can only be added to an attack error or another block assist'
      }
      // One blocker is a solo block; two or three blockers each get a block assist.
      if (body.result === 'solo' && blocks.length > 0) return 'a solo block has to be the only block'
      if (body.result === 'assist' && blocks.some((b) => b.type === 'block' && b.result === 'solo')) {
        return 'a solo block has to be the only block'
      }
      if (blocks.length >= 3) return 'at most three players can block'
      return null
    }

    default:
      return "that can't be added to this play"
  }
}
