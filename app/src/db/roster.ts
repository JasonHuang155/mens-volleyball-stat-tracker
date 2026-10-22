import { v4 as uuidv4 } from 'uuid'
import type { MatchEvent, Player, Position, Team } from '../domain/types.ts'
import type { StatsDatabase } from './database.ts'

export type PlayerInput = { name: string; number: number; position: Position }

export async function createTeam(db: StatsDatabase, name: string): Promise<Team> {
  const team: Team = { id: uuidv4(), name: requireName(name, 'Enter a team name') }
  await db.teams.add(team)
  return team
}

export async function listTeams(db: StatsDatabase): Promise<Team[]> {
  return db.teams.toArray()
}

/** A team's players, sorted by jersey number. */
export async function listPlayers(db: StatsDatabase, teamId: string): Promise<Player[]> {
  return db.players.where('teamId').equals(teamId).sortBy('number')
}

export async function addPlayer(db: StatsDatabase, teamId: string, input: PlayerInput): Promise<Player> {
  const player: Player = { id: uuidv4(), teamId, ...(await checkPlayer(db, teamId, input)) }
  await db.players.add(player)
  return player
}

export async function updatePlayer(db: StatsDatabase, player: Player): Promise<void> {
  const checked = await checkPlayer(db, player.teamId, player, player.id)
  await db.players.put({ ...player, ...checked })
}

/**
 * Removes a player from the roster, but only if they never appear in a match.
 * Deleting someone with stats would leave events pointing at nobody.
 */
export async function deletePlayer(db: StatsDatabase, playerId: string): Promise<void> {
  const used = await db.events.filter((event) => mentionsPlayer(event, playerId)).count()
  if (used > 0) throw new Error("This player has played in a match, so they can't be deleted")
  await db.players.delete(playerId)
}

/** Cleans up a player's details and checks them. Returns the cleaned-up details. */
async function checkPlayer(
  db: StatsDatabase,
  teamId: string,
  input: PlayerInput,
  existingId?: string,
): Promise<PlayerInput> {
  const name = requireName(input.name, 'Enter a player name')
  if (!Number.isInteger(input.number) || input.number < 0 || input.number > 99) {
    throw new Error('Jersey numbers go from 0 to 99')
  }
  const clash = await db.players
    .where('teamId')
    .equals(teamId)
    .filter((p) => p.number === input.number && p.id !== existingId)
    .first()
  if (clash) throw new Error(`#${input.number} is already ${clash.name}'s number`)
  return { name, number: input.number, position: input.position }
}

function requireName(name: string, message: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error(message)
  return trimmed
}

function mentionsPlayer(event: MatchEvent, playerId: string): boolean {
  if ('playerId' in event && event.playerId === playerId) return true
  if (event.type === 'set_start') {
    const { lineup, setterId, liberoId } = event.detail
    return lineup.includes(playerId) || setterId === playerId || liberoId === playerId
  }
  if (event.type === 'substitution') return event.detail.playerOutId === playerId
  return false
}
