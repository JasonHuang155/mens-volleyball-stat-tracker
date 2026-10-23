import { v4 as uuidv4 } from 'uuid'
import { followUpProblem } from './plays.ts'
import { replay, startingRotation } from './replay.ts'
import type { EventBase, EventBody, Match, MatchEvent, MatchState, StatBody } from './types.ts'
import { activeEvents, lastActiveEvent } from './undo.ts'

type MatchInfo = Pick<Match, 'id' | 'bestOf'>
type Situation = Pick<EventBase, 'setNumber' | 'rallyNumber' | 'servingSide' | 'homeRotation' | 'awayRotation'>

/**
 * Turns one tap into a saved event: adds an id, the next seq number, and the
 * game situation right now (set, rally, who's serving, both rotations).
 * Throws, without saving anything, if the tap breaks the rules.
 */
export function recordAction(match: MatchInfo, events: MatchEvent[], body: EventBody): MatchEvent {
  const state = replay(match, events)
  const event: MatchEvent = {
    ...body,
    id: uuidv4(),
    matchId: match.id,
    seq: nextSeq(events),
    actionId: uuidv4(),
    createdAt: new Date().toISOString(),
    ...situation(state, body),
  }

  replay(match, [...events, event]) // throws if this event breaks the rules
  return event
}

/**
 * Adds another player's credit to the play just recorded: the assist on a
 * kill, the receiver on an ace, the blockers on a blocked attack, and so on
 * (see plays.ts). It joins that play's action and rally, so the point isn't
 * counted twice and Undo removes the whole play.
 */
export function recordFollowUp(match: MatchInfo, events: MatchEvent[], body: StatBody): MatchEvent {
  const last = lastActiveEvent(events)
  if (!last) throw new Error('there is no play to add to')

  const play = activeEvents(events).filter((e) => e.actionId === last.actionId)
  const problem = followUpProblem(play, body)
  if (problem) throw new Error(problem)

  const event: MatchEvent = {
    ...body,
    id: uuidv4(),
    matchId: match.id,
    seq: nextSeq(events),
    actionId: last.actionId,
    createdAt: new Date().toISOString(),
    setNumber: last.setNumber,
    rallyNumber: last.rallyNumber,
    servingSide: last.servingSide,
    homeRotation: last.homeRotation,
    awayRotation: last.awayRotation,
  }

  replay(match, [...events, event]) // throws if this event breaks the rules
  return event
}

/** Cancels the most recent play that still counts. Returns null if there's nothing to undo. */
export function recordUndo(match: MatchInfo, events: MatchEvent[]): MatchEvent | null {
  const last = lastActiveEvent(events)
  if (!last) return null
  return recordAction(match, events, { type: 'undo', detail: { voidsActionId: last.actionId } })
}

/** 1 for the first event, then one more than the highest seq so far. */
export function nextSeq(events: MatchEvent[]): number {
  return events.reduce((highest, e) => Math.max(highest, e.seq), 0) + 1
}

/** The game situation stamped on an event. A set_start records the set it begins. */
function situation(state: MatchState, body: EventBody): Situation {
  if (body.type === 'set_start') {
    return {
      setNumber: state.setNumber + 1,
      rallyNumber: 1,
      servingSide: body.detail.firstServe,
      homeRotation: startingRotation(body.detail.home),
      awayRotation: startingRotation(body.detail.away),
    }
  }
  return {
    setNumber: state.setNumber,
    rallyNumber: state.rallyNumber,
    servingSide: state.servingSide,
    homeRotation: state.courts.home.rotation,
    awayRotation: state.courts.away.rotation,
  }
}
