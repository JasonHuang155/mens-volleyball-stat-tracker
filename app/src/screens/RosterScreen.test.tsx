// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { db } from '../db/database.ts'
import { createMatch, recordTap } from '../db/matches.ts'
import { addPlayer, createTeam } from '../db/roster.ts'
import type { Position } from '../domain/types.ts'
import { renderApp } from '../test/renderApp.tsx'

async function openRoster() {
  const team = await createTeam(db, 'Huskies')
  const { user } = renderApp(`/teams/${team.id}`)
  await screen.findByRole('heading', { name: 'Huskies' })
  return { team, user }
}

async function addThroughForm(user: UserEvent, number: string, name: string, position: Position) {
  const form = screen.getByRole('form', { name: 'Add a player' })
  if (number) await user.type(within(form).getByLabelText('Number'), number)
  if (name) await user.type(within(form).getByLabelText('Name'), name)
  await user.click(within(form).getByRole('radio', { name: position }))
  await user.click(within(form).getByRole('button', { name: 'Add player' }))
}

/** The roster rows as text, e.g. ["#3Lee LiberoL", "#12Sam SetterS"]. */
async function rosterRows() {
  const list = await screen.findByRole('list', { name: 'Roster' })
  return within(list)
    .queryAllByRole('button')
    .map((row) => row.textContent)
}

describe('roster screen', () => {
  it('adds players and lists them by jersey number', async () => {
    const { user } = await openRoster()
    await addThroughForm(user, '12', 'Sam Setter', 'S')
    await addThroughForm(user, '3', 'Lee Libero', 'L')

    await screen.findByText('2 players')
    expect(await rosterRows()).toEqual(['#3Lee LiberoL', '#12Sam SetterS'])
  })

  it('clears the form after adding, ready for the next player', async () => {
    const { user } = await openRoster()
    await addThroughForm(user, '7', 'Max Middle', 'MB')
    await screen.findByText('1 player')

    const numberBox = within(screen.getByRole('form', { name: 'Add a player' })).getByLabelText('Number')
    expect((numberBox as HTMLInputElement).value).toBe('')
    expect(document.activeElement).toBe(numberBox)
  })

  it('explains why a player can’t be added', async () => {
    const { user } = await openRoster()
    await addThroughForm(user, '', 'No Number', 'OH')
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a jersey number')

    await user.clear(screen.getByLabelText('Name'))
    await addThroughForm(user, '7', 'Max Middle', 'MB')
    await screen.findByText('1 player')
    await addThroughForm(user, '7', 'Another Seven', 'OH')
    expect((await screen.findByRole('alert')).textContent).toBe("#7 is already Max Middle's number")
  })

  it('edits a player', async () => {
    const { team, user } = await openRoster()
    await addPlayer(db, team.id, { name: 'Max Midle', number: 7, position: 'MB' })

    await user.click(await screen.findByRole('button', { name: /Max Midle/ }))
    const form = screen.getByRole('form', { name: 'Edit #7 Max Midle' })
    await user.clear(within(form).getByLabelText('Name'))
    await user.type(within(form).getByLabelText('Name'), 'Max Middle')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('button', { name: /Max Middle/ })).toBeTruthy()
    expect(screen.queryByRole('form', { name: /Edit/ })).toBe(null)
  })

  it('deletes a player only after a second tap', async () => {
    const { team, user } = await openRoster()
    await addPlayer(db, team.id, { name: 'Typo Name', number: 1, position: 'OH' })

    await user.click(await screen.findByRole('button', { name: /Typo Name/ }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await db.players.count()).toBe(1) // the first tap only asks to confirm
    await user.click(screen.getByRole('button', { name: 'Tap again to delete' }))

    expect(await screen.findByText('No players yet.')).toBeTruthy()
    expect(await db.players.count()).toBe(0)
  })

  it('won’t delete a player who has played in a match', async () => {
    const { team, user } = await openRoster()
    const ids = []
    for (let n = 1; n <= 6; n++) {
      ids.push((await addPlayer(db, team.id, { name: `Player ${n}`, number: n, position: 'OH' })).id)
    }
    const match = await createMatch(db, { teamId: team.id, opponentName: 'Rivals', bestOf: 5 })
    await recordTap(db, match, {
      type: 'set_start',
      detail: { lineup: ids, setterId: ids[0], liberoId: null, firstServe: 'us' },
    })

    await user.click(await screen.findByRole('button', { name: /Player 1/ }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Tap again to delete' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      "This player has played in a match, so they can't be deleted",
    )
  })

  it('says so when the team doesn’t exist', async () => {
    renderApp('/teams/no-such-team')
    expect(await screen.findByRole('heading', { name: 'Team not found' })).toBeTruthy()
  })
})
