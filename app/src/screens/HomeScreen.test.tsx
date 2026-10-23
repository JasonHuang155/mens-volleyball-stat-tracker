// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db } from '../db/database.ts'
import { recordTap } from '../db/matches.ts'
import { addPlayer, createTeam } from '../db/roster.ts'
import { setUpMatch, startSet } from '../test/fixtures.ts'
import { renderApp } from '../test/renderApp.tsx'

describe('home screen', () => {
  it('asks you to add teams first', async () => {
    renderApp('/')
    expect(await screen.findByText(/Add your team and the teams you play/)).toBeTruthy()
    expect(screen.getByText('Add at least two teams to start a match.')).toBeTruthy()
  })

  it('adds teams and links to each roster', async () => {
    const { user } = renderApp('/')
    await user.type(await screen.findByLabelText('Team name'), 'Huskies')
    await user.click(screen.getByRole('button', { name: 'Add team' }))
    await user.type(screen.getByLabelText('Team name'), 'Rivals')
    await user.click(screen.getByRole('button', { name: 'Add team' }))

    expect(await screen.findByRole('link', { name: 'New match' })).toBeTruthy()
    await user.click(screen.getByRole('link', { name: /Huskies/ }))
    expect(await screen.findByRole('heading', { name: 'Add a player' })).toBeTruthy()
  })

  it('needs a team name', async () => {
    const { user } = renderApp('/')
    await user.click(await screen.findByRole('button', { name: 'Add team' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a team name')
  })

  it('shows how many players each team has', async () => {
    const team = await createTeam(db, 'Huskies')
    await addPlayer(db, team.id, { name: 'Sam Setter', number: 12, position: 'S' })
    renderApp('/')
    expect(await screen.findByText('1 player')).toBeTruthy()
  })

  it('lists matches with where they stand, away team first', async () => {
    const fixture = await setUpMatch()
    await startSet(fixture)
    for (let i = 0; i < 3; i++) await recordTap(db, fixture.match, { type: 'point', side: 'home' })

    renderApp('/')
    const row = await screen.findByRole('link', { name: /Rivals at Huskies/ })
    expect(row.textContent).toContain('Set 1 · 0–3')
  })
})
