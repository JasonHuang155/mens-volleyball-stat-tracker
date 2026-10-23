// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { db } from '../db/database.ts'
import { createTeam } from '../db/roster.ts'
import { AWAY_ROSTER, HOME_ROSTER, giveSetTo, setUpMatch, startSet } from '../test/fixtures.ts'
import { renderApp } from '../test/renderApp.tsx'

/** Fills one team's six court positions with the first six players on its roster. */
async function pickStartingSix(user: UserEvent, teamName: string, roster: typeof HOME_ROSTER) {
  const group = within(screen.getByRole('group', { name: `${teamName} lineup` }))
  for (let i = 0; i < 6; i++) {
    const [number, name] = roster[i]
    await user.selectOptions(group.getByLabelText(`Position ${i + 1}`), name ? `#${number} ${name}` : `#${number}`)
  }
}

describe('creating a match', () => {
  it('picks the away and home teams, then goes to the set 1 lineups', async () => {
    await createTeam(db, 'Huskies')
    await createTeam(db, 'Rivals')
    const { user } = renderApp('/')
    await user.click(await screen.findByRole('link', { name: 'New match' }))
    await user.selectOptions(await screen.findByLabelText('Away team'), 'Rivals')
    await user.selectOptions(screen.getByLabelText('Home team'), 'Huskies')
    await user.click(screen.getByRole('radio', { name: 'Best of 3' }))
    await user.click(screen.getByRole('button', { name: 'Create match' }))

    expect(await screen.findByRole('heading', { name: 'Rivals at Huskies' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Set 1 lineups' })).toBeTruthy()
    expect((await db.matches.toArray())[0].bestOf).toBe(3)
  })

  it('needs two different teams', async () => {
    await createTeam(db, 'Huskies')
    await createTeam(db, 'Rivals')
    const { user } = renderApp('/new-match')
    await user.selectOptions(await screen.findByLabelText('Away team'), 'Huskies')
    await user.selectOptions(screen.getByLabelText('Home team'), 'Huskies')
    await user.click(screen.getByRole('button', { name: 'Create match' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Pick two different teams')
  })
})

describe('set lineups', () => {
  it('starts set 1 with both teams’ lineups', async () => {
    const { match, players } = await setUpMatch()
    const { user } = renderApp(`/matches/${match.id}`)
    await screen.findByRole('heading', { name: 'Set 1 lineups' })

    await pickStartingSix(user, 'Rivals', AWAY_ROSTER)
    await pickStartingSix(user, 'Huskies', HOME_ROSTER)
    // Setters and liberos are guessed from the roster positions.
    const huskies = within(screen.getByRole('group', { name: 'Huskies lineup' }))
    expect((huskies.getByLabelText('Setter') as HTMLSelectElement).value).toBe(players.home[0].id)
    expect((huskies.getByLabelText('Libero') as HTMLSelectElement).value).toBe(players.home[6].id)
    const rivals = within(screen.getByRole('group', { name: 'Rivals lineup' }))
    expect((rivals.getByLabelText('Setter') as HTMLSelectElement).value).toBe(players.away[0].id)

    await user.click(screen.getByRole('radio', { name: 'Huskies' }))
    await user.click(screen.getByRole('button', { name: 'Start set 1' }))
    expect(await screen.findByText('Huskies #1 Sam Setter serving')).toBeTruthy()
  })

  it('says what’s missing', async () => {
    const { match } = await setUpMatch()
    const { user } = renderApp(`/matches/${match.id}`)
    await user.click(await screen.findByRole('button', { name: 'Start set 1' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Pick a player for every Rivals position')

    await pickStartingSix(user, 'Rivals', AWAY_ROSTER)
    await user.click(screen.getByRole('button', { name: 'Start set 1' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Pick a player for every Huskies position')

    await pickStartingSix(user, 'Huskies', HOME_ROSTER)
    await user.click(screen.getByRole('button', { name: 'Start set 1' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Choose who serves first')
  })

  it('won’t let one player be in two positions', async () => {
    const { match } = await setUpMatch()
    const { user } = renderApp(`/matches/${match.id}`)
    const huskies = within(await screen.findByRole('group', { name: 'Huskies lineup' }))
    await user.selectOptions(huskies.getByLabelText('Position 1'), '#1 Sam Setter')
    const options = Array.from((huskies.getByLabelText('Position 2') as HTMLSelectElement).options)
    expect(options.map((o) => o.text)).not.toContain('#1 Sam Setter')
  })

  it('starts set 2 from set 1’s lineups, with the other team serving first', async () => {
    const fixture = await setUpMatch()
    await startSet(fixture, 'home')
    await giveSetTo(fixture, 'home')

    const { user } = renderApp(`/matches/${fixture.match.id}`)
    await screen.findByRole('heading', { name: 'Set 2 lineups' })
    expect(screen.getByText('Set 1 final')).toBeTruthy()
    const huskies = within(screen.getByRole('group', { name: 'Huskies lineup' }))
    expect((huskies.getByLabelText('Position 1') as HTMLSelectElement).value).toBe(fixture.players.home[0].id)
    expect((screen.getByRole('radio', { name: 'Rivals' }) as HTMLInputElement).checked).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Start set 2' }))
    expect(await screen.findByText('Rivals #10 serving')).toBeTruthy()
  })

  it('marks the deciding set', async () => {
    const fixture = await setUpMatch(3)
    await startSet(fixture, 'home')
    await giveSetTo(fixture, 'home')
    await startSet(fixture, 'away')
    await giveSetTo(fixture, 'away')

    renderApp(`/matches/${fixture.match.id}`)
    await screen.findByRole('heading', { name: 'Set 3 lineups' })
    expect(screen.getByText('Deciding set: first to 15')).toBeTruthy()
  })

  it('asks for more players when a roster is too small', async () => {
    const { match } = await setUpMatch(5, 4)
    renderApp(`/matches/${match.id}`)
    expect(await screen.findByText(/Rivals needs at least 6 players/)).toBeTruthy()
  })

  it('can undo a set start to fix the lineups', async () => {
    const fixture = await setUpMatch()
    await startSet(fixture)
    const { user } = renderApp(`/matches/${fixture.match.id}`)
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('heading', { name: 'Set 1 lineups' })).toBeTruthy()
  })
})

describe('finished match', () => {
  it('says who won', async () => {
    const fixture = await setUpMatch(3)
    await startSet(fixture, 'home')
    await giveSetTo(fixture, 'away')
    await startSet(fixture, 'home')
    await giveSetTo(fixture, 'away')

    renderApp(`/matches/${fixture.match.id}`)
    expect(await screen.findByRole('heading', { name: 'Rivals won' })).toBeTruthy()
  })
})
