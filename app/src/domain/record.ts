import { v4 as uuidv4 } from 'uuid'
import { replay, startingRotation } from './replay.ts'
import type { EventBase, EventBody, Match, MatchEvent, MatchState } from './types.ts'

type MatchInfo = Pick<Match, 'id' | 'bestOf'>
type Situation = Pick<EventBase, 'setNumber' | 'rallyNumber' | 'servingTeam' | 'rotation'>

/**
 * Turns one tap into a saved event: adds an id, the next seq number, and the
 * game situation right now (set, rally, who's serving, rotation).
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
      servingTeam: body.detail.firstServe,
      rotation: startingRotation(body.detail),
    }
  }
  return {
    setNumber: state.setNumber,
    rallyNumber: state.rallyNumber,
    servingTeam: state.servingTeam,
    rotation: state.rotation,
  }
}
