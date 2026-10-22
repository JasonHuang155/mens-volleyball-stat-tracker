import type { MatchEvent, PassRating, Player } from './types.ts'

// ============================================================================
// YOUR PART (step 7): write the body of each function below.
//
// Each one currently calls notImplemented(), which makes its tests fail.
// Replace that line with your code, then run the tests from the app folder:
//
//   npm.cmd run test:watch -- boxScore
//
// The tests are in boxScore.test.ts. They re-run every time you save.
// Suggested order: top to bottom. The first four are one-liners.
// ============================================================================

/** One player's row in the box score. The comments are the NCAA column names. */
export interface PlayerLine {
  playerId: string
  setsPlayed: number // S
  kills: number // K
  attackErrors: number // E
  totalAttacks: number // TA: every attack, whatever the result
  hittingPercentage: number | null // PCT
  assists: number // AST
  serviceAces: number // SA
  serviceErrors: number // SE
  receptionAttempts: number // RetAtt: every pass
  receptionErrors: number // RErr: passes rated 0
  passAverage: number | null // not an NCAA stat: average pass rating, 0-3
  digs: number // DIG
  blockSolos: number // BS
  blockAssists: number // BA
  totalBlocks: number // not an NCAA column, but coaches use it
  blockErrors: number // BE
  ballHandlingErrors: number // BHE
  points: number // PTS
}

/**
 * Hitting percentage = (kills - errors) / total attacks.
 * Example: 10 kills, 2 errors, 24 attempts → (10 - 2) / 24 = 0.333...
 * It can be negative. With 0 attempts there is no percentage, so return null.
 */
export function hittingPercentage(kills: number, errors: number, attempts: number): number | null {
  return notImplemented('hittingPercentage', kills, errors, attempts)
}

/**
 * The average of the pass ratings (each 0-3). Example: [3, 2, 2, 1] → 2.
 * With no passes there is no average, so return null.
 */
export function passAverage(ratings: PassRating[]): number | null {
  return notImplemented('passAverage', ratings)
}

/** Total blocks = solo blocks + half of block assists. Example: 1 solo, 2 assists → 2. */
export function totalBlocks(solos: number, assists: number): number {
  return notImplemented('totalBlocks', solos, assists)
}

/**
 * NCAA points = kills + service aces + solo blocks + half of block assists.
 * Example: 10 kills, 2 aces, 1 solo, 3 block assists → 14.5
 */
export function points(kills: number, aces: number, blockSolos: number, blockAssists: number): number {
  return notImplemented('points', kills, aces, blockSolos, blockAssists)
}

/**
 * How many sets this player played in. A player played in a set if they
 * were in that set's starting lineup (a 'set_start' event's detail.lineup)
 * or came on court during it (they're the playerId of a 'substitution'
 * event: a regular sub or a libero swap). Every event has a setNumber.
 * Count each set once, even if the player came in twice.
 */
export function setsPlayed(events: MatchEvent[], playerId: string): number {
  return notImplemented('setsPlayed', events, playerId)
}

/**
 * The full box score: one PlayerLine per player, in the same order as
 * `players`. Players who did nothing get a line of zeros (and null for the
 * two averages). Ignore events without a player (their_point, their_error).
 *
 * `events` only contains events that still count (undone plays are already
 * removed), so you don't need to think about Undo.
 *
 * Tip: check event.type before reading event.playerId or event.result.
 * Once TypeScript knows the type, it knows which fields that event has.
 */
export function buildBoxScore(events: MatchEvent[], players: Player[]): PlayerLine[] {
  return notImplemented('buildBoxScore', events, players)
}

/** Placeholder that makes a test fail. Delete it once every function above is written. */
function notImplemented(name: string, ..._inputs: unknown[]): never {
  throw new Error(`${name} isn't written yet`)
}
