import type { MatchEvent, PassRating, Player } from './types.ts'

// Per-player stats, counted from the events. Nothing here is ever saved:
// the box score is rebuilt from the event list whenever it's needed.

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
  if (attempts === 0) return null
  return (kills - errors) / attempts
}

/**
 * The average of the pass ratings (each 0-3). Example: [3, 2, 2, 1] → 2.
 * With no passes there is no average, so return null.
 */
export function passAverage(ratings: PassRating[]): number | null {
  if (ratings.length === 0) return null
  let total = 0
  for (const rating of ratings) total += rating
  return total / ratings.length
}

/** Total blocks = solo blocks + half of block assists. Example: 1 solo, 2 assists → 2. */
export function totalBlocks(solos: number, assists: number): number {
  return solos + assists / 2
}

/**
 * NCAA points = kills + service aces + solo blocks + half of block assists.
 * Example: 10 kills, 2 aces, 1 solo, 3 block assists → 14.5
 */
export function points(kills: number, aces: number, blockSolos: number, blockAssists: number): number {
  return kills + aces + blockSolos + blockAssists / 2
}

/**
 * How many sets this player played in. A player played in a set if they
 * were in that set's starting lineup or came on court during it (a regular
 * sub or a libero swap). Each set counts once, even if they came in twice.
 */
export function setsPlayed(events: MatchEvent[], playerId: string): number {
  const sets = new Set<number>() // a Set ignores duplicates, so each set number is kept once
  for (const event of events) {
    const started = event.type === 'set_start' && event.detail.lineup.includes(playerId)
    const cameIn = event.type === 'substitution' && event.playerId === playerId
    if (started || cameIn) sets.add(event.setNumber)
  }
  return sets.size
}

/**
 * The full box score: one PlayerLine per player, in the same order as
 * `players`. Players who did nothing get a line of zeros (and null for the
 * two averages). Events without a player (their_point, their_error) count
 * for no one.
 *
 * `events` only contains events that still count (undone plays are already
 * removed by activeEvents).
 */
export function buildBoxScore(events: MatchEvent[], players: Player[]): PlayerLine[] {
  return players.map((player) => playerLine(events, player.id))
}

/**
 * The team row at the bottom of the box score. Counts are added up, but the
 * percentages are worked out again from the totals, not averaged: a player
 * who went 1-for-1 shouldn't count as much as one who went 10-for-20.
 */
export function teamTotals(lines: PlayerLine[], setsPlayed: number): PlayerLine {
  const sum = (stat: (line: PlayerLine) => number) => lines.reduce((total, line) => total + stat(line), 0)
  const kills = sum((l) => l.kills)
  const attackErrors = sum((l) => l.attackErrors)
  const totalAttacks = sum((l) => l.totalAttacks)
  const serviceAces = sum((l) => l.serviceAces)
  const receptionAttempts = sum((l) => l.receptionAttempts)
  const blockSolos = sum((l) => l.blockSolos)
  const blockAssists = sum((l) => l.blockAssists)
  // Each player's average times their attempts gives back the sum of their ratings.
  const ratingTotal = sum((l) => (l.passAverage ?? 0) * l.receptionAttempts)

  return {
    playerId: 'team',
    setsPlayed,
    kills,
    attackErrors,
    totalAttacks,
    hittingPercentage: hittingPercentage(kills, attackErrors, totalAttacks),
    assists: sum((l) => l.assists),
    serviceAces,
    serviceErrors: sum((l) => l.serviceErrors),
    receptionAttempts,
    receptionErrors: sum((l) => l.receptionErrors),
    passAverage: receptionAttempts === 0 ? null : ratingTotal / receptionAttempts,
    digs: sum((l) => l.digs),
    blockSolos,
    blockAssists,
    totalBlocks: totalBlocks(blockSolos, blockAssists),
    blockErrors: sum((l) => l.blockErrors),
    ballHandlingErrors: sum((l) => l.ballHandlingErrors),
    points: points(kills, serviceAces, blockSolos, blockAssists),
  }
}

function playerLine(events: MatchEvent[], playerId: string): PlayerLine {
  const line: PlayerLine = {
    playerId,
    setsPlayed: setsPlayed(events, playerId),
    kills: 0,
    attackErrors: 0,
    totalAttacks: 0,
    hittingPercentage: null,
    assists: 0,
    serviceAces: 0,
    serviceErrors: 0,
    receptionAttempts: 0,
    receptionErrors: 0,
    passAverage: null,
    digs: 0,
    blockSolos: 0,
    blockAssists: 0,
    totalBlocks: 0,
    blockErrors: 0,
    ballHandlingErrors: 0,
    points: 0,
  }
  const passRatings: PassRating[] = []

  // Step 1: count this player's taps.
  for (const event of events) {
    if (!('playerId' in event) || event.playerId !== playerId) continue

    switch (event.type) {
      case 'attack':
        line.totalAttacks += 1
        if (event.result === 'kill') line.kills += 1
        if (event.result === 'error') line.attackErrors += 1
        break
      case 'serve':
        if (event.result === 'ace') line.serviceAces += 1
        if (event.result === 'error') line.serviceErrors += 1
        break
      case 'pass':
        passRatings.push(event.result)
        break
      case 'block':
        if (event.result === 'solo') line.blockSolos += 1
        if (event.result === 'assist') line.blockAssists += 1
        if (event.result === 'error') line.blockErrors += 1
        break
      case 'dig':
        line.digs += 1
        break
      case 'assist':
        line.assists += 1
        break
      case 'ball_handling_error':
        line.ballHandlingErrors += 1
        break
    }
  }

  // Step 2: work out the stats that come from those counts.
  line.receptionAttempts = passRatings.length
  line.receptionErrors = passRatings.filter((rating) => rating === 0).length
  line.passAverage = passAverage(passRatings)
  line.hittingPercentage = hittingPercentage(line.kills, line.attackErrors, line.totalAttacks)
  line.totalBlocks = totalBlocks(line.blockSolos, line.blockAssists)
  line.points = points(line.kills, line.serviceAces, line.blockSolos, line.blockAssists)
  return line
}
