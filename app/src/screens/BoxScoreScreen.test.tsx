// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db } from '../db/database.ts'
import { recordFollowUpTap, recordTap } from '../db/matches.ts'
import { giveSetTo, setUpMatch, startSet, type Fixture } from '../test/fixtures.ts'
import { renderApp } from '../test/renderApp.tsx'

const id = (fixture: Fixture, side: 'home' | 'away', index: number) => fixture.players[side][index].id

/**
 * A few rallies, Huskies serving:
 * Huskies #4 kill (assist #1), Huskies #4 attack error (not blocked), Rivals #13 kill (Rivals side out,
 * so #11 serves), then a Rivals #11 ace with a reception error by Huskies #5.
 */
async function playSomeRallies(fixture: Fixture) {
  const { match } = fixture
  await recordTap(db, match, { type: 'attack', side: 'home', playerId: id(fixture, 'home', 3), result: 'kill', detail: { row: 'front' } })
  await recordFollowUpTap(db, match, { type: 'assist', side: 'home', playerId: id(fixture, 'home', 0) })
  await recordTap(db, match, { type: 'attack', side: 'home', playerId: id(fixture, 'home', 3), result: 'error', detail: { row: 'front' } })
  await recordTap(db, match, { type: 'attack', side: 'away', playerId: id(fixture, 'away', 3), result: 'kill', detail: { row: 'front' } })
  await recordTap(db, match, { type: 'serve', side: 'away', playerId: id(fixture, 'away', 1), result: 'ace', detail: { serveType: 'jump_spin' } })
  await recordFollowUpTap(db, match, { type: 'pass', side: 'home', playerId: id(fixture, 'home', 4), result: 0 })
}

/** One row of a team's table as { K: '1', PCT: '.000', ... }. */
function rowStats(teamName: string, rowName: RegExp | string) {
  const table = within(screen.getByRole('table', { name: `${teamName} stats` }))
  const headers = table.getAllByRole('columnheader').slice(1).map((h) => h.textContent ?? '')
  const cells = within(table.getByRole('row', { name: rowName })).getAllByRole('cell')
  return Object.fromEntries(cells.map((cell, i) => [headers[i], cell.textContent]))
}

async function openBoxScore(fixture: Fixture) {
  const result = renderApp(`/matches/${fixture.match.id}/box-score`)
  await screen.findByRole('table', { name: 'Huskies stats' })
  return result
}

describe('box score screen', () => {
  it('shows a table for each team, away team first', async () => {
    const fixture = await setUpMatch()
    await startSet(fixture)
    await openBoxScore(fixture)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Rivals', 'Huskies'])
  })

  it('shows each player’s stats in NCAA columns, for both teams', async () => {
    const fixture = await setUpMatch()
    await startSet(fixture)
    await playSomeRallies(fixture)
    await openBoxScore(fixture)

    expect(rowStats('Huskies', /#4 Otto Opposite/)).toMatchObject({ S: '1', K: '1', E: '1', TA: '2', PCT: '.000' })
    expect(rowStats('Huskies', /#1 Sam Setter/)).toMatchObject({ A: '1', PCT: '—' })
    expect(rowStats('Huskies', /#5 Olly Outside/)).toMatchObject({ RA: '1', RE: '1', PASS: '0.00' })
    expect(rowStats('Rivals', /^#13/)).toMatchObject({ K: '1', TA: '1', PCT: '1.000', PTS: '1' })
    expect(rowStats('Rivals', /^#11/)).toMatchObject({ SA: '1', PTS: '1' })
  })

  it('adds a team row for each team', async () => {
    const fixture = await setUpMatch()
    await startSet(fixture)
    await playSomeRallies(fixture)
    await openBoxScore(fixture)

    expect(rowStats('Huskies', /^Team/)).toMatchObject({ K: '1', E: '1', TA: '2', PCT: '.000', A: '1', RE: '1' })
    expect(rowStats('Rivals', /^Team/)).toMatchObject({ K: '1', SA: '1', PTS: '2' })
  })

  it('shows the score of each set', async () => {
    const fixture = await setUpMatch()
    await startSet(fixture)
    await giveSetTo(fixture, 'home')
    await startSet(fixture, 'away')
    await recordTap(db, fixture.match, { type: 'point', side: 'away' })
    await openBoxScore(fixture)

    const scores = within(screen.getByRole('table', { name: 'Set scores' }))
    expect(scores.getByRole('row', { name: /Rivals/ }).textContent).toBe('Rivals01')
    expect(scores.getByRole('row', { name: /Huskies/ }).textContent).toBe('Huskies250')
  })

  it('leaves out players who never got on the court', async () => {
    const fixture = await setUpMatch()
    await startSet(fixture)
    await openBoxScore(fixture)
    const huskies = within(screen.getByRole('table', { name: 'Huskies stats' }))
    expect(huskies.queryByRole('row', { name: /Ben Bench/ })).toBe(null)
    expect(huskies.queryByRole('row', { name: /Lee Libero/ })).toBe(null) // the libero never swapped in
    expect(huskies.getByRole('row', { name: /Max Middle/ })).toBeTruthy()
  })

  it('can show one set at a time', async () => {
    const fixture = await setUpMatch()
    await startSet(fixture)
    await playSomeRallies(fixture)
    await giveSetTo(fixture, 'home')
    await startSet(fixture)
    await recordTap(db, fixture.match, { type: 'attack', side: 'home', playerId: id(fixture, 'home', 2), result: 'kill', detail: { row: 'front' } })

    const { user } = await openBoxScore(fixture)
    expect(rowStats('Huskies', /#4 Otto Opposite/)).toMatchObject({ S: '2', K: '1' })

    await user.click(screen.getByRole('radio', { name: 'Set 2' }))
    expect(rowStats('Huskies', /#4 Otto Opposite/)).toMatchObject({ S: '1', K: '0' })
    expect(rowStats('Huskies', /#3 Max Middle/)).toMatchObject({ K: '1' })
    expect(rowStats('Huskies', /^Team/)).toMatchObject({ S: '1', K: '1' })
  })

  it('opens from the match screen', async () => {
    const fixture = await setUpMatch()
    await startSet(fixture)
    const { user } = renderApp(`/matches/${fixture.match.id}`)
    await user.click(await screen.findByRole('link', { name: 'Box score ›' }))
    expect(await screen.findByRole('heading', { name: 'Box score' })).toBeTruthy()
  })

  it('says when there’s nothing to show yet', async () => {
    const fixture = await setUpMatch()
    renderApp(`/matches/${fixture.match.id}/box-score`)
    expect(await screen.findByText(/No stats yet/)).toBeTruthy()
  })
})
