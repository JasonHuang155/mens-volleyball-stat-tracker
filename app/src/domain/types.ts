// Shared types for the volleyball logic. Nothing in domain/ knows about React or the database.

/** The two teams in a match. Every player tap says which side it belongs to. */
export type Side = 'home' | 'away'
export type Position = 'OH' | 'OPP' | 'MB' | 'S' | 'L'
export type BestOf = 3 | 5
/** A team's rotation, named by where its setter is: rotation 1 = setter in court position 1. */
export type Rotation = 1 | 2 | 3 | 4 | 5 | 6
export type ServeType = 'jump_spin' | 'jump_float' | 'standing_float'
/** 3 = perfect pass, 0 = aced (a reception error). */
export type PassRating = 0 | 1 | 2 | 3
export type Row = 'front' | 'back'

export interface Team {
  id: string
  name: string
}

export interface Player {
  id: string
  teamId: string
  /** Can be empty: stat crews often only know the other team's jersey numbers. */
  name: string
  number: number
  position: Position
}

export interface Match {
  id: string
  homeTeamId: string
  awayTeamId: string
  bestOf: BestOf
  createdAt: string
}

// ---- What a tap records ----
// Each event type only has the fields it needs, and TypeScript checks them:
// a pass must have a 0-3 result, an attack must say front or back row, and so on.

export type ServeBody = {
  type: 'serve'
  side: Side
  playerId: string
  result: 'ace' | 'error' | 'in'
  detail: { serveType: ServeType }
}
export type PassBody = { type: 'pass'; side: Side; playerId: string; result: PassRating }
export type AttackBody = {
  type: 'attack'
  side: Side
  playerId: string
  result: 'kill' | 'error' | 'in_play'
  detail: { row: Row }
}
export type BlockBody = { type: 'block'; side: Side; playerId: string; result: 'solo' | 'assist' | 'error' }
export type DigBody = { type: 'dig'; side: Side; playerId: string }
export type AssistBody = { type: 'assist'; side: Side; playerId: string }
export type BallHandlingErrorBody = { type: 'ball_handling_error'; side: Side; playerId: string }
/** A point with no player stat: a penalty, a rotation fault, or a rally the stat keeper missed. */
export type PointBody = { type: 'point'; side: Side }

/** Things that happen during a rally. */
export type StatBody =
  | ServeBody
  | PassBody
  | AttackBody
  | BlockBody
  | DigBody
  | AssistBody
  | BallHandlingErrorBody
  | PointBody

/** One team's starting lineup for a set. */
export type Lineup = {
  /** Player ids in court positions 1-6 (index 0 = position 1, the server). */
  players: string[]
  setterId: string
  liberoId: string | null
}

export type SetStartBody = {
  type: 'set_start'
  detail: { home: Lineup; away: Lineup; firstServe: Side }
}

/** Kind 'libero' is a libero swap: it doesn't count as a substitution in real volleyball. */
export type SubstitutionBody = {
  type: 'substitution'
  side: Side
  playerId: string
  detail: { playerOutId: string; kind: 'regular' | 'libero' }
}

/** Cancels every event in one earlier action. Nothing is ever deleted. */
export type UndoBody = { type: 'undo'; detail: { voidsActionId: string } }

export type EventBody = StatBody | SetStartBody | SubstitutionBody | UndoBody
export type EventType = EventBody['type']

/** Bookkeeping every saved event has, plus the game situation at the moment of the tap. */
export interface EventBase {
  /** UUID made on the phone, so the server can spot a duplicate upload (Phase 2). */
  id: string
  matchId: string
  /** 1, 2, 3... Exact order within the match, even if two taps share a timestamp. */
  seq: number
  /** Events from one play share this (an ace and the reception error), so Undo removes them together. */
  actionId: string
  createdAt: string
  setNumber: number
  /** Restarts at 1 each set. */
  rallyNumber: number
  servingSide: Side
  homeRotation: Rotation
  awayRotation: Rotation
}

export type MatchEvent = EventBase & EventBody

// ---- What replaying the events produces ----

export interface SetScore {
  home: number
  away: number
  winner: Side | null
}

export type MatchStatus = 'waiting_for_lineup' | 'playing' | 'finished'

/** One team's side of the court right now. */
export interface Court {
  /** Player ids on court in positions 1-6 (index 0 = position 1). */
  lineup: string[]
  liberoId: string | null
  /** The player the libero is in for, or null if the libero is on the bench. */
  liberoReplacing: string | null
  rotation: Rotation
}

/** Everything the app shows about a match. Never saved: always rebuilt from the events. */
export interface MatchState {
  status: MatchStatus
  /** The current set, or the last one played. 0 before the first set starts. */
  setNumber: number
  rallyNumber: number
  sets: SetScore[]
  setsWon: Record<Side, number>
  winner: Side | null
  servingSide: Side
  /** The player serving right now, or null between sets. */
  serverId: string | null
  courts: Record<Side, Court>
}
