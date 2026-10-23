import { matchWinner, pointWinner, setWinner } from './rules.ts'
import type {
  Court,
  Lineup,
  Match,
  MatchEvent,
  MatchState,
  Rotation,
  Row,
  SetStartBody,
  Side,
  SubstitutionBody,
} from './types.ts'
import { activeEvents } from './undo.ts'

const SIDES: Side[] = ['home', 'away']

/**
 * Rebuilds a match by playing back its events in order, like re-reading a bank
 * statement to get the balance. Throws if an event breaks the rules, which is
 * how the app checks a tap before saving it.
 */
export function replay(match: Pick<Match, 'bestOf'>, events: MatchEvent[]): MatchState {
  const state = initialState()
  const pointsByAction = new Map<string, Side>()

  for (const event of activeEvents(events)) {
    // A follow-up tap (the assist on a kill, the receiver who was aced, the blockers on
    // a blocked attack) joins a play that already scored. Its player gets credit, but
    // the score doesn't change again.
    const alreadyScoredFor = pointsByAction.get(event.actionId)
    if (alreadyScoredFor) {
      const winner = pointWinner(event)
      if (winner && winner !== alreadyScoredFor) fail(event, 'one play can only give the point to one team')
      continue
    }

    switch (event.type) {
      case 'set_start':
        startSet(state, event)
        break
      case 'substitution':
        requirePlaying(state, event)
        if (event.detail.kind === 'libero') swapLibero(state.courts[event.side], event)
        else substitute(state.courts[event.side], event)
        break
      case 'undo':
        break // activeEvents already left these out
      default: {
        requirePlaying(state, event)
        if (event.type !== 'point') {
          const court = state.courts[event.side]
          if (!court.lineup.includes(event.playerId)) fail(event, "that player isn't on court for their team")
        }
        if (event.type === 'serve') {
          if (state.servingSide !== event.side) fail(event, "that team isn't serving")
          if (event.playerId !== state.courts[event.side].lineup[0]) {
            fail(event, 'only the player in position 1 can serve')
          }
        }
        // A pass rating is a serve-receive stat (NCAA "reception"), so it needs the other team's serve.
        if (event.type === 'pass' && state.servingSide === event.side) {
          fail(event, "passes are rated on the other team's serve")
        }
        const winner = pointWinner(event)
        if (winner) {
          pointsByAction.set(event.actionId, winner)
          awardPoint(state, winner, match.bestOf)
        }
      }
    }
  }

  state.serverId = state.status === 'playing' ? state.courts[state.servingSide].lineup[0] : null
  return state
}

/** The rotation number a lineup starts in: the setter's court position. */
export function startingRotation(lineup: Lineup): Rotation {
  return (lineup.players.indexOf(lineup.setterId) + 1) as Rotation
}

/** Front row is court positions 2, 3 and 4. Returns null if the player isn't on that team's court. */
export function courtRow(state: MatchState, side: Side, playerId: string): Row | null {
  const index = state.courts[side].lineup.indexOf(playerId)
  if (index === -1) return null
  return isFrontRow(index) ? 'front' : 'back'
}

/** Lineup index 1-3 = court positions 2-4. */
function isFrontRow(index: number) {
  return index >= 1 && index <= 3
}

function emptyCourt(): Court {
  return { lineup: [], liberoId: null, liberoReplacing: null, rotation: 1 }
}

function initialState(): MatchState {
  return {
    status: 'waiting_for_lineup',
    setNumber: 0,
    rallyNumber: 0,
    sets: [],
    setsWon: { home: 0, away: 0 },
    winner: null,
    servingSide: 'home',
    serverId: null,
    courts: { home: emptyCourt(), away: emptyCourt() },
  }
}

function startSet(state: MatchState, event: MatchEvent & SetStartBody) {
  if (state.status === 'playing') fail(event, 'a set is already in progress')
  if (state.status === 'finished') fail(event, 'the match is over')

  for (const side of SIDES) {
    const { players, setterId, liberoId } = event.detail[side]
    const team = side === 'home' ? 'the home team' : 'the away team'
    if (players.length !== 6 || new Set(players).size !== 6) fail(event, `${team} needs 6 different players`)
    if (!players.includes(setterId)) fail(event, `${team}'s setter must be in the lineup`)
    if (liberoId && players.includes(liberoId)) fail(event, `${team}'s libero starts on the bench`)
  }

  state.status = 'playing'
  state.setNumber += 1
  state.sets.push({ home: 0, away: 0, winner: null })
  state.rallyNumber = 1
  state.servingSide = event.detail.firstServe
  for (const side of SIDES) {
    const lineup = event.detail[side]
    state.courts[side] = {
      lineup: [...lineup.players],
      liberoId: lineup.liberoId,
      liberoReplacing: null,
      rotation: startingRotation(lineup),
    }
  }
}

function awardPoint(state: MatchState, winner: Side, bestOf: Match['bestOf']) {
  const set = state.sets[state.sets.length - 1]
  set[winner] += 1
  state.rallyNumber += 1

  // Sideout: the receiving team won the rally, so it serves next.
  // A team rotates one spot each time it wins the serve back.
  if (winner !== state.servingSide) {
    state.servingSide = winner
    rotate(state.courts[winner])
  }

  const setWon = setWinner(set.home, set.away, state.setNumber, bestOf)
  if (setWon) {
    set.winner = setWon
    state.setsWon[setWon] += 1
    state.winner = matchWinner(state.setsWon, bestOf)
    state.status = state.winner ? 'finished' : 'waiting_for_lineup'
  }
}

/** Clockwise: position 2 moves to 1 (the new server), and position 1 moves to 6. */
function rotate(court: Court) {
  court.lineup = [...court.lineup.slice(1), court.lineup[0]]
  // The setter moves from position p to p - 1, so rotations go 1, 6, 5, 4, 3, 2.
  court.rotation = (court.rotation === 1 ? 6 : court.rotation - 1) as Rotation

  // The libero can't play in the front row. When they'd rotate into position 4,
  // the player they replaced comes back automatically.
  if (court.liberoReplacing && court.lineup[3] === court.liberoId) returnFromLibero(court)
}

/** A regular substitution: the new player takes the same spot in the rotation. */
function substitute(court: Court, event: MatchEvent & SubstitutionBody) {
  const playerIn = event.playerId
  const playerOut = event.detail.playerOutId
  if (playerIn === court.liberoId || playerOut === court.liberoId) {
    fail(event, 'the libero goes in and out with a libero swap, not a substitution')
  }
  const index = court.lineup.indexOf(playerOut)
  if (index === -1) fail(event, "the player going out isn't on court")
  if (court.lineup.includes(playerIn)) fail(event, 'the player coming in is already on court')
  if (playerIn === court.liberoReplacing) fail(event, 'that player can only come back in for the libero')

  court.lineup[index] = playerIn
}

/** The libero comes in for a back-row player, or goes out for the player they replaced. */
function swapLibero(court: Court, event: MatchEvent & SubstitutionBody) {
  const playerIn = event.playerId
  const playerOut = event.detail.playerOutId
  if (!court.liberoId) fail(event, 'there is no libero this set')

  if (playerIn === court.liberoId) {
    if (court.liberoReplacing) fail(event, 'the libero is already on court')
    const index = court.lineup.indexOf(playerOut)
    if (index === -1) fail(event, "the player going out isn't on court")
    if (isFrontRow(index)) fail(event, 'the libero can only replace a back-row player')
    court.lineup[index] = court.liberoId
    court.liberoReplacing = playerOut
  } else if (playerOut === court.liberoId) {
    if (!court.liberoReplacing) fail(event, "the libero isn't on court")
    if (playerIn !== court.liberoReplacing) {
      fail(event, 'only the player the libero replaced can come back in for the libero')
    }
    returnFromLibero(court)
  } else {
    fail(event, 'a libero swap has to move the libero in or out')
  }
}

function returnFromLibero(court: Court) {
  if (!court.liberoId || !court.liberoReplacing) return
  court.lineup[court.lineup.indexOf(court.liberoId)] = court.liberoReplacing
  court.liberoReplacing = null
}

function requirePlaying(state: MatchState, event: MatchEvent) {
  if (state.status === 'waiting_for_lineup') fail(event, 'no set is in progress')
  if (state.status === 'finished') fail(event, 'the match is over')
}

/**
 * A tap that breaks the rules. `message` says which event (for debugging);
 * `reason` is the plain explanation the screen shows.
 */
export class RuleError extends Error {
  reason: string

  constructor(event: MatchEvent, reason: string) {
    super(`Event #${event.seq} (${event.type}): ${reason}`)
    this.name = 'RuleError'
    this.reason = reason
  }
}

function fail(event: MatchEvent, reason: string): never {
  throw new RuleError(event, reason)
}
