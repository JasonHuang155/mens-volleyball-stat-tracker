import { v4 as uuidv4 } from 'uuid'
import { recordAction, recordFollowUp, recordUndo } from '../domain/record.ts'
import type { BestOf, EventBody, FollowUpBody, Match, MatchEvent } from '../domain/types.ts'
import type { StatsDatabase } from './database.ts'

export type MatchInput = { teamId: string; opponentName: string; bestOf: BestOf }

export async function createMatch(db: StatsDatabase, input: MatchInput): Promise<Match> {
  const opponentName = input.opponentName.trim()
  if (!opponentName) throw new Error('Enter the opponent’s name')
  if (!(await db.teams.get(input.teamId))) throw new Error('Pick a team first')

  const match: Match = {
    id: uuidv4(),
    teamId: input.teamId,
    opponentName,
    bestOf: input.bestOf,
    createdAt: new Date().toISOString(),
  }
  await db.matches.add(match)
  return match
}

export async function getMatch(db: StatsDatabase, matchId: string): Promise<Match | undefined> {
  return db.matches.get(matchId)
}

/** All matches, newest first. */
export async function listMatches(db: StatsDatabase): Promise<Match[]> {
  return db.matches.orderBy('createdAt').reverse().toArray()
}

/** Every event saved for a match (including undone ones), in seq order. */
export async function getEvents(db: StatsDatabase, matchId: string): Promise<MatchEvent[]> {
  return db.events.where('matchId').equals(matchId).sortBy('seq')
}

// The three functions below each read the match's events, build the new
// event, and save it inside one transaction. Transactions on the same table
// run one at a time, so two quick taps can't both be given the same seq number.

/** Checks a tap against the rules and saves it. Throws, saving nothing, if it's not allowed. */
export async function recordTap(db: StatsDatabase, match: Match, body: EventBody): Promise<MatchEvent> {
  return db.transaction('rw', db.events, async () => {
    const event = recordAction(match, await getEvents(db, match.id), body)
    await db.events.add(event)
    return event
  })
}

/** Saves an assist or extra blocker as part of the play just recorded. */
export async function recordFollowUpTap(db: StatsDatabase, match: Match, body: FollowUpBody): Promise<MatchEvent> {
  return db.transaction('rw', db.events, async () => {
    const event = recordFollowUp(match, await getEvents(db, match.id), body)
    await db.events.add(event)
    return event
  })
}

/** Saves an undo for the last play. Returns null if there's nothing to undo. */
export async function undoLastTap(db: StatsDatabase, match: Match): Promise<MatchEvent | null> {
  return db.transaction('rw', db.events, async () => {
    const event = recordUndo(match, await getEvents(db, match.id))
    if (event) await db.events.add(event)
    return event
  })
}
