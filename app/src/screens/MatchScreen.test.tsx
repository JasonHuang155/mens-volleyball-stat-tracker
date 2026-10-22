// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { db } from '../db/database.ts'
import { createMatch, recordTap } from '../db/matches.ts'
import { addPlayer, createTeam } from '../db/roster.ts'
import type { BestOf, Match, Player, Position } from '../domain/types.ts'
import { renderApp } from '../test/renderApp.tsx'

const ROSTER: [number, string, Position][] = [
  [1, 'Sam Setter', 'S'],
  [2, 'Oscar Outside', 'OH'],
  [3, 'Max Middle', 'MB'],
  [4, 'Otto Opposite', 'OPP'],
  [5, 'Olly Outside', 'OH'],
  [6, 'Mo Middle', 'MB'],
  [7, 'Lee Libero', 'L'],
]

async function setUp(bestOf: BestOf = 5, rosterSize = ROSTER.length) {
  const team = await createTeam(db, 'Huskies')
  const players: Player[] = []
  for (const [number, name, position] of ROSTER.slice(0, rosterSize)) {
    players.push(await addPlayer(db, team.id, { number, name, position }))
  }
  const match = await createMatch(db, { teamId: team.id, opponentName: 'Rivals', bestOf })
  return { team, players, match }
}

/** Saves a set 1 start with players 1-6 in positions 1-6. */
async function startSetOne(match: Match, players: Player[]) {
  await recordTap(db, match, {
    type: 'set_start',
    detail: {
      lineup: players.slice(0, 6).map((p) => p.id),
      setterId: players[0].id,
      liberoId: players[6].id,
      firstServe: 'us',
    },
  })
}

async function pickStartingSix(user: UserEvent) {
  for (let i = 0; i < 6; i++) {
    const [number, name] = ROSTER[i]
    await user.selectOptions(screen.getByLabelText(`Position ${i + 1}`), `#${number} ${name}`)
  }
}

describe('creating a match', () => {
  it('goes from home to the set 1 lineup', async () => {
    await createTeam(db, 'Huskies')
    const { user } = renderApp('/')
    await user.click(await screen.findByRole('link', { name: 'New match' }))
    await user.type(await screen.findByLabelText('Opponent'), 'Rivals')
    await user.click(screen.getByRole('radio', { name: 'Best of 3' }))
    await user.click(screen.getByRole('button', { name: 'Create match' }))

    expect(await screen.findByRole('heading', { name: 'vs Rivals' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Set 1 lineup' })).toBeTruthy()
    expect((await db.matches.toArray())[0].bestOf).toBe(3)
  })

  it('needs an opponent name', async () => {
    const team = await createTeam(db, 'Huskies')
    const { user } = renderApp(`/teams/${team.id}/new-match`)
    await user.click(await screen.findByRole('button', { name: 'Create match' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Enter the opponent’s name')
  })

  it('lists matches on the home screen with where they stand', async () => {
    const { match, players } = await setUp()
    await startSetOne(match, players)
    for (let i = 0; i < 3; i++) await recordTap(db, match, { type: 'their_error' })

    renderApp('/')
    const row = await screen.findByRole('link', { name: /vs Rivals/ })
    expect(row.textContent).toContain('Set 1 · 3–0')
  })
})

describe('set lineup', () => {
  it('starts set 1 with the chosen lineup', async () => {
    const { match, players } = await setUp()
    const { user } = renderApp(`/matches/${match.id}`)
    await screen.findByRole('heading', { name: 'Set 1 lineup' })

    await pickStartingSix(user)
    // The setter and libero are guessed from the roster positions.
    expect((screen.getByLabelText('Setter') as HTMLSelectElement).value).toBe(players[0].id)
    expect((screen.getByLabelText('Libero') as HTMLSelectElement).value).toBe(players[6].id)
    expect(screen.getByText('Starts in rotation 1')).toBeTruthy()

    await user.click(screen.getByRole('radio', { name: 'Huskies' }))
    await user.click(screen.getByRole('button', { name: 'Start set 1' }))

    expect(await screen.findByText('#1 Sam Setter serving · Rotation 1')).toBeTruthy()
    expect(screen.getByText('Set 1')).toBeTruthy()
  })

  it('says what’s missing', async () => {
    const { match } = await setUp()
    const { user } = renderApp(`/matches/${match.id}`)
    await user.click(await screen.findByRole('button', { name: 'Start set 1' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Pick a player for every position')

    await pickStartingSix(user)
    await user.click(screen.getByRole('button', { name: 'Start set 1' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Choose who serves first')
  })

  it('won’t let one player be in two positions', async () => {
    const { match } = await setUp()
    const { user } = renderApp(`/matches/${match.id}`)
    await user.selectOptions(await screen.findByLabelText('Position 1'), '#1 Sam Setter')
    const position2Options = Array.from((screen.getByLabelText('Position 2') as HTMLSelectElement).options)
    expect(position2Options.map((o) => o.text)).not.toContain('#1 Sam Setter')
  })

  it('starts set 2 from set 1’s lineup, with the other team serving first', async () => {
    const { match, players } = await setUp()
    await startSetOne(match, players)
    for (let i = 0; i < 25; i++) await recordTap(db, match, { type: 'their_error' })

    const { user } = renderApp(`/matches/${match.id}`)
    await screen.findByRole('heading', { name: 'Set 2 lineup' })
    expect(screen.getByText('Set 1 final')).toBeTruthy()
    expect((screen.getByLabelText('Position 1') as HTMLSelectElement).value).toBe(players[0].id)
    expect((screen.getByRole('radio', { name: 'Rivals' }) as HTMLInputElement).checked).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Start set 2' }))
    expect(await screen.findByText('Rivals serving · Rotation 1')).toBeTruthy()
  })

  it('marks the deciding set', async () => {
    const { match, players } = await setUp(3)
    await startSetOne(match, players)
    for (let i = 0; i < 25; i++) await recordTap(db, match, { type: 'their_error' })
    await recordTap(db, match, {
      type: 'set_start',
      detail: { lineup: players.slice(0, 6).map((p) => p.id), setterId: players[0].id, liberoId: null, firstServe: 'them' },
    })
    for (let i = 0; i < 25; i++) await recordTap(db, match, { type: 'their_point' })

    renderApp(`/matches/${match.id}`)
    await screen.findByRole('heading', { name: 'Set 3 lineup' })
    expect(screen.getByText('Deciding set: first to 15')).toBeTruthy()
  })

  it('asks for more players when the roster is too small', async () => {
    const { match } = await setUp(5, 4)
    renderApp(`/matches/${match.id}`)
    expect(await screen.findByText(/You need at least 6 players/)).toBeTruthy()
  })

  it('can undo a set start to fix the lineup', async () => {
    const { match, players } = await setUp()
    await startSetOne(match, players)
    const { user } = renderApp(`/matches/${match.id}`)
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('heading', { name: 'Set 1 lineup' })).toBeTruthy()
  })
})

describe('finished match', () => {
  it('says who won', async () => {
    const { match, players } = await setUp(3)
    await startSetOne(match, players)
    for (let i = 0; i < 25; i++) await recordTap(db, match, { type: 'their_error' })
    await recordTap(db, match, {
      type: 'set_start',
      detail: { lineup: players.slice(0, 6).map((p) => p.id), setterId: players[0].id, liberoId: null, firstServe: 'them' },
    })
    for (let i = 0; i < 25; i++) await recordTap(db, match, { type: 'their_error' })

    renderApp(`/matches/${match.id}`)
    expect(await screen.findByRole('heading', { name: 'Huskies won' })).toBeTruthy()
    expect(screen.getByText('Sets 2–0')).toBeTruthy()
  })
})
