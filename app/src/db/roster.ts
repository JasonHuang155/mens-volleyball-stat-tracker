import { v4 as uuidv4 } from 'uuid'
import type { MatchEvent, Player, Position, Team } from '../domain/types.ts'
import type { StatsDatabase } from './database.ts'

export type PlayerInput = { name: string; number: number; position: Position }

export async function createTeam(db: StatsDatabase, name: string): Promise<Team> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Enter a team name')
  const team: Team = { id: uuidv4(), name: trimmed }
  await db.teams.add(team)
  return team
}

/** Every saved team (yours and your opponents), in alphabetical order. */
export async function listTeams(db: StatsDatabase): Promise<Team[]> {
  const teams = await db.teams.toArray()
  return teams.sort((a, b) => a.name.localeCompare(b.name))
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

/** "#7 Max Middle", or just "#7" for a player saved without a name. */
export function playerLabel(player: Pick<Player, 'number' | 'name'>): string {
  return player.name ? `#${player.number} ${player.name}` : `#${player.number}`
}

/**
 * Cleans up a player's details and checks them. Returns the cleaned-up details.
 * The name is optional: stat crews often only know the other team's numbers.
 */
async function checkPlayer(
  db: StatsDatabase,
  teamId: string,
  input: PlayerInput,
  existingId?: string,
): Promise<PlayerInput> {
  if (!Number.isInteger(input.number) || input.number < 0 || input.number > 99) {
    throw new Error('Jersey numbers go from 0 to 99')
  }
  const clash = await db.players
    .where('teamId')
    .equals(teamId)
    .filter((p) => p.number === input.number && p.id !== existingId)
    .first()
  if (clash) throw new Error(clash.name ? `#${input.number} is already ${clash.name}'s number` : `#${input.number} is already taken`)
  return { name: input.name.trim(), number: input.number, position: input.position }
}

function mentionsPlayer(event: MatchEvent, playerId: string): boolean {
  if ('playerId' in event && event.playerId === playerId) return true
  if (event.type === 'set_start') {
    return [event.detail.home, event.detail.away].some(
      (lineup) => lineup.players.includes(playerId) || lineup.setterId === playerId || lineup.liberoId === playerId,
    )
  }
  if (event.type === 'substitution') return event.detail.playerOutId === playerId
  return false
}
