// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db } from '../db/database.ts'
import { addPlayer, createTeam } from '../db/roster.ts'
import { renderApp } from '../test/renderApp.tsx'

describe('home screen', () => {
  it('asks you to create a team first', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Create your team' })).toBeTruthy()
  })

  it('creates a team and links to its roster', async () => {
    const { user } = renderApp('/')
    await user.type(await screen.findByLabelText('Team name'), 'Huskies')
    await user.click(screen.getByRole('button', { name: 'Create team' }))

    expect(await screen.findByRole('heading', { name: 'Huskies' })).toBeTruthy()
    await user.click(screen.getByRole('link', { name: 'Roster' }))
    expect(await screen.findByRole('heading', { name: 'Add a player' })).toBeTruthy()
  })

  it('needs a team name', async () => {
    const { user } = renderApp('/')
    await user.click(await screen.findByRole('button', { name: 'Create team' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a team name')
  })

  it('shows how many players the team has', async () => {
    const team = await createTeam(db, 'Huskies')
    await addPlayer(db, team.id, { name: 'Sam Setter', number: 12, position: 'S' })
    renderApp('/')
    expect(await screen.findByText('1 player')).toBeTruthy()
  })
})
