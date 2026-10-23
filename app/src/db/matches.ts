import { v4 as uuidv4 } from 'uuid'
import { recordAction, recordFollowUp, recordUndo } from '../domain/record.ts'
import type { BestOf, EventBody, Match, MatchEvent, Player, Side, StatBody, Team } from '../domain/types.ts'
import type { StatsDatabase } from './database.ts'
import { listPlayers } from './roster.ts'

export type MatchInput = { homeTeamId: string; awayTeamId: string; bestOf: BestOf }

export async function createMatch(db: StatsDatabase, input: MatchInput): Promise<Match> {
  if (!input.homeTeamId || !input.awayTeamId) throw new Error('Pick both teams')
  if (input.homeTeamId === input.awayTeamId) throw new Error('Pick two different teams')
  const [home, away] = await Promise.all([db.teams.get(input.homeTeamId), db.teams.get(input.awayTeamId)])
  if (!home || !away) throw new Error('Pick both teams')

  const match: Match = {
    id: uuidv4(),
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    bestOf: input.bestOf,
    createdAt: new Date().toISOString(),
  }
  await db.matches.add(match)
  return match
}

export async function getMatch(db: StatsDatabase, matchId: string): Promise<Match | undefined> {
  return db.matches.get(matchId)
}

/** Everything a match screen needs: the match, both teams and rosters, and every saved tap. */
export type MatchData = {
  match: Match
  teams: Record<Side, Team>
  rosters: Record<Side, Player[]>
  events: MatchEvent[]
}

export async function getMatchData(db: StatsDatabase, matchId: string): Promise<MatchData | null> {
  const match = await db.matches.get(matchId)
  if (!match) return null
  const [home, away, homeRoster, awayRoster, events] = await Promise.all([
    db.teams.get(match.homeTeamId),
    db.teams.get(match.awayTeamId),
    listPlayers(db, match.homeTeamId),
    listPlayers(db, match.awayTeamId),
    getEvents(db, matchId),
  ])
  return {
    match,
    teams: {
      home: home ?? { id: match.homeTeamId, name: 'Home' },
      away: away ?? { id: match.awayTeamId, name: 'Away' },
    },
    rosters: { home: homeRoster, away: awayRoster },
    events,
  }
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

/** Saves another player's part in the play just recorded (an assist, the aced receiver, a blocker...). */
export async function recordFollowUpTap(db: StatsDatabase, match: Match, body: StatBody): Promise<MatchEvent> {
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
