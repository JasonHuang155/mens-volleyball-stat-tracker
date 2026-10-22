import { matchWinner, pointWinner, setWinner } from './rules.ts'
import type {
  Match,
  MatchEvent,
  MatchState,
  Rotation,
  Row,
  SetStartBody,
  Team,
} from './types.ts'

/**
 * Rebuilds a match by playing back its events in order, like re-reading a bank
 * statement to get the balance. Throws if an event breaks the rules, which is
 * how the app checks a tap before saving it.
 */
export function replay(match: Pick<Match, 'bestOf'>, events: MatchEvent[]): MatchState {
  const state = initialState()
  const ordered = [...events].sort((a, b) => a.seq - b.seq)

  for (const event of ordered) {
    switch (event.type) {
      case 'set_start':
        startSet(state, event)
        break
      case 'substitution':
      case 'undo':
        fail(event, 'not supported yet')
        break
      default: {
        requirePlaying(state, event)
        if (event.type === 'serve') {
          if (state.servingTeam !== 'us') fail(event, "we can't serve when they're serving")
          if (event.playerId !== state.lineup[0]) fail(event, 'only the player in position 1 can serve')
        }
        const winner = pointWinner(event)
        if (winner) awardPoint(state, winner, match.bestOf)
      }
    }
  }

  state.serverId = state.status === 'playing' && state.servingTeam === 'us' ? state.lineup[0] : null
  return state
}

/** The rotation number a lineup starts in: the setter's court position. */
export function startingRotation(detail: SetStartBody['detail']): Rotation {
  return (detail.lineup.indexOf(detail.setterId) + 1) as Rotation
}

/** Front row is court positions 2, 3 and 4. Returns null if the player isn't on court. */
export function courtRow(state: MatchState, playerId: string): Row | null {
  const index = state.lineup.indexOf(playerId)
  if (index === -1) return null
  return index >= 1 && index <= 3 ? 'front' : 'back'
}

function initialState(): MatchState {
  return {
    status: 'waiting_for_lineup',
    setNumber: 0,
    rallyNumber: 0,
    sets: [],
    setsWon: { us: 0, them: 0 },
    winner: null,
    servingTeam: 'us',
    serverId: null,
    lineup: [],
    liberoId: null,
    liberoReplacing: null,
    rotation: 1,
  }
}

function startSet(state: MatchState, event: MatchEvent & SetStartBody) {
  if (state.status === 'playing') fail(event, 'a set is already in progress')
  if (state.status === 'finished') fail(event, 'the match is over')

  const { lineup, setterId, liberoId, firstServe } = event.detail
  if (lineup.length !== 6 || new Set(lineup).size !== 6) fail(event, 'a lineup needs 6 different players')
  if (!lineup.includes(setterId)) fail(event, 'the setter must be in the lineup')
  if (liberoId && lineup.includes(liberoId)) fail(event, 'the libero starts on the bench')

  state.status = 'playing'
  state.setNumber += 1
  state.sets.push({ us: 0, them: 0, winner: null })
  state.rallyNumber = 1
  state.lineup = [...lineup]
  state.liberoId = liberoId
  state.liberoReplacing = null
  state.servingTeam = firstServe
  state.rotation = startingRotation(event.detail)
}

function awardPoint(state: MatchState, winner: Team, bestOf: Match['bestOf']) {
  const set = state.sets[state.sets.length - 1]
  set[winner] += 1
  state.rallyNumber += 1

  // Sideout: the receiving team won the rally, so it serves next.
  // When we win the serve back, everyone rotates one spot.
  if (winner !== state.servingTeam) {
    state.servingTeam = winner
    if (winner === 'us') rotate(state)
  }

  const setWon = setWinner(set.us, set.them, state.setNumber, bestOf)
  if (setWon) {
    set.winner = setWon
    state.setsWon[setWon] += 1
    state.winner = matchWinner(state.setsWon, bestOf)
    state.status = state.winner ? 'finished' : 'waiting_for_lineup'
  }
}

/** Clockwise: position 2 moves to 1 (the new server), and position 1 moves to 6. */
function rotate(state: MatchState) {
  state.lineup = [...state.lineup.slice(1), state.lineup[0]]
  // The setter moves from position p to p - 1, so rotations go 1, 6, 5, 4, 3, 2.
  state.rotation = (state.rotation === 1 ? 6 : state.rotation - 1) as Rotation
}

function requirePlaying(state: MatchState, event: MatchEvent) {
  if (state.status === 'waiting_for_lineup') fail(event, 'no set is in progress')
  if (state.status === 'finished') fail(event, 'the match is over')
}

function fail(event: MatchEvent, message: string): never {
  throw new Error(`Event #${event.seq} (${event.type}): ${message}`)
}
