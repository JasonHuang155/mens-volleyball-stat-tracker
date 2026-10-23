// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db } from '../db/database.ts'
import { createMatch, recordFollowUpTap, recordTap } from '../db/matches.ts'
import { addPlayer, createTeam } from '../db/roster.ts'
import type { Match, Player, Position } from '../domain/types.ts'
import { renderApp } from '../test/renderApp.tsx'

// #1-#6 start in positions 1-6, #7 is the libero, #8 is on the bench.
const ROSTER: [number, string, Position][] = [
  [1, 'Sam Setter', 'S'],
  [2, 'Oscar Outside', 'OH'],
  [3, 'Max Middle', 'MB'],
  [4, 'Otto Opposite', 'OPP'],
  [5, 'Olly Outside', 'OH'],
  [6, 'Mo Middle', 'MB'],
  [7, 'Lee Libero', 'L'],
  [8, 'Ben Bench', 'OH'],
]

let match: Match
let players: Player[]
const id = (number: number) => players[number - 1].id

async function setUp() {
  const team = await createTeam(db, 'Huskies')
  players = []
  for (const [number, name, position] of ROSTER) players.push(await addPlayer(db, team.id, { number, name, position }))
  match = await createMatch(db, { teamId: team.id, opponentName: 'Rivals', bestOf: 5 })
}

async function startSet() {
  await recordTap(db, match, {
    type: 'set_start',
    detail: { lineup: players.slice(0, 6).map((p) => p.id), setterId: id(1), liberoId: id(7), firstServe: 'us' },
  })
}

/** A few rallies: #4 kill (assist #1), #4 attack error, #2 kill, then #2 serves an ace. */
async function playSomeRallies() {
  await recordTap(db, match, { type: 'attack', playerId: id(4), result: 'kill', detail: { row: 'front' } })
  await recordFollowUpTap(db, match, { type: 'assist', playerId: id(1) })
  await recordTap(db, match, { type: 'attack', playerId: id(4), result: 'error', detail: { row: 'front' } })
  await recordTap(db, match, { type: 'attack', playerId: id(2), result: 'kill', detail: { row: 'front' } }) // sideout: #2 serves
  await recordTap(db, match, { type: 'serve', playerId: id(2), result: 'ace', detail: { serveType: 'jump_spin' } })
}

/** One row of the table as { K: '1', PCT: '.000', ... }. */
function rowStats(rowName: RegExp | string) {
  const headers = screen.getAllByRole('columnheader').slice(1).map((h) => h.textContent ?? '')
  const cells = within(screen.getByRole('row', { name: rowName })).getAllByRole('cell')
  return Object.fromEntries(cells.map((cell, i) => [headers[i], cell.textContent]))
}

describe('box score screen', () => {
  it('shows each player’s stats in NCAA columns', async () => {
    await setUp()
    await startSet()
    await playSomeRallies()
    renderApp(`/matches/${match.id}/box-score`)
    await screen.findByRole('table', { name: 'Box score' })

    expect(rowStats(/#4 Otto Opposite/)).toMatchObject({ S: '1', K: '1', E: '1', TA: '2', PCT: '.000', PTS: '1' })
    expect(rowStats(/#2 Oscar Outside/)).toMatchObject({ K: '1', TA: '1', PCT: '1.000', SA: '1', PTS: '2' })
    expect(rowStats(/#1 Sam Setter/)).toMatchObject({ A: '1', PCT: '—' })
  })

  it('adds a team row, with hitting worked out from the totals', async () => {
    await setUp()
    await startSet()
    await playSomeRallies()
    renderApp(`/matches/${match.id}/box-score`)
    await screen.findByRole('table', { name: 'Box score' })

    expect(rowStats(/^Team/)).toMatchObject({ K: '2', E: '1', TA: '3', PCT: '.333', A: '1', SA: '1', PTS: '3' })
  })

  it('leaves out players who never got on the court', async () => {
    await setUp()
    await startSet()
    renderApp(`/matches/${match.id}/box-score`)
    await screen.findByRole('table', { name: 'Box score' })

    expect(screen.queryByRole('row', { name: /Ben Bench/ })).toBe(null)
    expect(screen.queryByRole('row', { name: /Lee Libero/ })).toBe(null) // the libero never swapped in
    expect(screen.getByRole('row', { name: /Max Middle/ })).toBeTruthy()
  })

  it('can show one set at a time', async () => {
    await setUp()
    await startSet()
    await playSomeRallies()
    for (let i = 0; i < 22; i++) await recordTap(db, match, { type: 'their_error' }) // set 1 ends 25-1
    await startSet()
    await recordTap(db, match, { type: 'attack', playerId: id(3), result: 'kill', detail: { row: 'front' } })

    const { user } = renderApp(`/matches/${match.id}/box-score`)
    await screen.findByRole('table', { name: 'Box score' })
    expect(rowStats(/#4 Otto Opposite/)).toMatchObject({ S: '2', K: '1' })
    expect(screen.getByText(/25–1, 1–0/)).toBeTruthy()

    await user.click(screen.getByRole('radio', { name: 'Set 2' }))
    expect(rowStats(/#4 Otto Opposite/)).toMatchObject({ S: '1', K: '0' })
    expect(rowStats(/#3 Max Middle/)).toMatchObject({ K: '1' })
    expect(rowStats(/^Team/)).toMatchObject({ S: '1', K: '1' })
  })

  it('opens from the match screen', async () => {
    await setUp()
    await startSet()
    const { user } = renderApp(`/matches/${match.id}`)
    await user.click(await screen.findByRole('link', { name: 'Box score ›' }))
    expect(await screen.findByRole('heading', { name: 'Box score' })).toBeTruthy()
  })

  it('says when there’s nothing to show yet', async () => {
    await setUp()
    renderApp(`/matches/${match.id}/box-score`)
    expect(await screen.findByText(/No stats yet/)).toBeTruthy()
  })
})
