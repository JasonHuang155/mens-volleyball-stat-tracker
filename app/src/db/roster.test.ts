import { v4 as uuidv4 } from 'uuid'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type StatsDatabase } from './database.ts'
import { createMatch, recordTap } from './matches.ts'
import { addPlayer, createTeam, deletePlayer, listPlayers, listTeams, playerLabel, updatePlayer } from './roster.ts'

// Each test gets its own empty database, deleted afterwards.
let db: StatsDatabase
beforeEach(() => {
  db = createDatabase(`test-${uuidv4()}`)
})
afterEach(async () => {
  await db.delete()
})

describe('teams', () => {
  it('saves teams and lists them alphabetically', async () => {
    const rivals = await createTeam(db, 'Rivals')
    const huskies = await createTeam(db, '  Huskies ')
    expect(huskies.name).toBe('Huskies')
    expect(await listTeams(db)).toEqual([huskies, rivals])
  })

  it('needs a name', async () => {
    await expect(createTeam(db, '   ')).rejects.toThrow('Enter a team name')
  })
})

describe('players', () => {
  it('saves players and lists them by jersey number', async () => {
    const team = await createTeam(db, 'Huskies')
    const setter = await addPlayer(db, team.id, { name: 'Sam Setter', number: 12, position: 'S' })
    const libero = await addPlayer(db, team.id, { name: 'Lee Libero', number: 3, position: 'L' })
    expect(setter).toMatchObject({ teamId: team.id, name: 'Sam Setter', number: 12, position: 'S' })
    expect(await listPlayers(db, team.id)).toEqual([libero, setter])
  })

  it('lets a player be saved with just a number', async () => {
    const team = await createTeam(db, 'Rivals')
    const player = await addPlayer(db, team.id, { name: '  ', number: 9, position: 'OH' })
    expect(player.name).toBe('')
    expect(playerLabel(player)).toBe('#9')
  })

  it('keeps each team’s roster separate', async () => {
    const a = await createTeam(db, 'Team A')
    const b = await createTeam(db, 'Team B')
    await addPlayer(db, a.id, { name: 'A Player', number: 7, position: 'OH' })
    await addPlayer(db, b.id, { name: 'B Player', number: 7, position: 'OH' }) // same number is fine on another team
    expect(await listPlayers(db, a.id)).toHaveLength(1)
  })

  it('rejects a bad number or a number already taken', async () => {
    const team = await createTeam(db, 'Huskies')
    await addPlayer(db, team.id, { name: 'Max Middle', number: 7, position: 'MB' })
    await addPlayer(db, team.id, { name: '', number: 8, position: 'OH' })
    await expect(addPlayer(db, team.id, { name: 'X', number: 100, position: 'OH' })).rejects.toThrow(
      'Jersey numbers go from 0 to 99',
    )
    await expect(addPlayer(db, team.id, { name: 'X', number: 7, position: 'OH' })).rejects.toThrow(
      "#7 is already Max Middle's number",
    )
    await expect(addPlayer(db, team.id, { name: 'X', number: 8, position: 'OH' })).rejects.toThrow('#8 is already taken')
  })

  it('updates a player, still checking the number', async () => {
    const team = await createTeam(db, 'Huskies')
    const max = await addPlayer(db, team.id, { name: 'Max Middle', number: 7, position: 'MB' })
    await addPlayer(db, team.id, { name: 'Oscar Opposite', number: 9, position: 'OPP' })

    await updatePlayer(db, { ...max, number: 8, position: 'OPP' })
    expect((await listPlayers(db, team.id))[0]).toMatchObject({ name: 'Max Middle', number: 8, position: 'OPP' })

    await expect(updatePlayer(db, { ...max, number: 9 })).rejects.toThrow("#9 is already Oscar Opposite's number")
  })

  it('deletes a player who never played', async () => {
    const team = await createTeam(db, 'Huskies')
    const player = await addPlayer(db, team.id, { name: 'Typo Name', number: 1, position: 'OH' })
    await deletePlayer(db, player.id)
    expect(await listPlayers(db, team.id)).toEqual([])
  })

  it('won’t delete a player who appears in a match', async () => {
    const home = await createTeam(db, 'Huskies')
    const away = await createTeam(db, 'Rivals')
    const homeIds = []
    const awayIds = []
    for (let n = 1; n <= 7; n++) {
      homeIds.push((await addPlayer(db, home.id, { name: `Player ${n}`, number: n, position: 'OH' })).id)
      awayIds.push((await addPlayer(db, away.id, { name: '', number: n, position: 'OH' })).id)
    }
    const match = await createMatch(db, { homeTeamId: home.id, awayTeamId: away.id, bestOf: 5 })
    await recordTap(db, match, {
      type: 'set_start',
      detail: {
        home: { players: homeIds.slice(0, 6), setterId: homeIds[0], liberoId: null },
        away: { players: awayIds.slice(0, 6), setterId: awayIds[0], liberoId: null },
        firstServe: 'home',
      },
    })

    // Each of these only appears in a starting lineup; homeIds[6] never played.
    await expect(deletePlayer(db, homeIds[5])).rejects.toThrow(
      "This player has played in a match, so they can't be deleted",
    )
    await expect(deletePlayer(db, awayIds[2])).rejects.toThrow('This player has played in a match')
    await deletePlayer(db, homeIds[6])
    expect(await listPlayers(db, home.id)).toHaveLength(6)
  })
})
