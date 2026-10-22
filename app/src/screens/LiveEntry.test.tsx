// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { db } from '../db/database.ts'
import { createMatch, getEvents, recordTap } from '../db/matches.ts'
import { addPlayer, createTeam } from '../db/roster.ts'
import { replay } from '../domain/replay.ts'
import type { Match, Player, Position, Side } from '../domain/types.ts'
import { activeEvents } from '../domain/undo.ts'
import { renderApp } from '../test/renderApp.tsx'

// #1-#6 start in positions 1-6, #7 is the libero, #8 is on the bench.
// Front row: #2, #3, #4. Back row: #1 (serving spot), #5, #6.
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

/** Starts set 1 and opens the match screen. `beforeOpen` can add taps first. */
async function openLiveScreen(firstServe: Side = 'us', beforeOpen?: () => Promise<void>) {
  const team = await createTeam(db, 'Huskies')
  players = []
  for (const [number, name, position] of ROSTER) players.push(await addPlayer(db, team.id, { number, name, position }))
  match = await createMatch(db, { teamId: team.id, opponentName: 'Rivals', bestOf: 5 })
  await recordTap(db, match, {
    type: 'set_start',
    detail: { lineup: players.slice(0, 6).map((p) => p.id), setterId: players[0].id, liberoId: players[6].id, firstServe },
  })
  await beforeOpen?.()
  const { user } = renderApp(`/matches/${match.id}`)
  await screen.findByText(/Last:/)
  return user
}

async function savedEvents() {
  return activeEvents(await getEvents(db, match.id))
}

async function score() {
  const state = replay(match, await getEvents(db, match.id))
  return state.sets[state.sets.length - 1]
}

function tapPlayer(user: UserEvent, number: number) {
  return user.click(screen.getByRole('button', { name: new RegExp(`^#${number} ${ROSTER[number - 1][1]}`) }))
}

function group(name: string | RegExp) {
  return within(screen.getByRole('group', { name }))
}

describe('recording stats', () => {
  it('records a kill in two taps, then asks who set it', async () => {
    const user = await openLiveScreen()
    await tapPlayer(user, 4)
    await user.click(group(/^Attack/).getByRole('button', { name: 'Kill' }))

    const strip = within(await screen.findByRole('region', { name: 'Assist by?' }))
    expect(strip.getAllByRole('button')[0].getAttribute('aria-label')).toBe('#1 Sam Setter') // setter first
    await user.click(strip.getByRole('button', { name: '#1 Sam Setter' }))

    await screen.findByText('Last: #1 Sam Setter: assist')
    expect(screen.queryByRole('region', { name: 'Assist by?' })).toBe(null)
    const [, kill, assist] = await savedEvents()
    expect(kill).toMatchObject({ type: 'attack', result: 'kill', detail: { row: 'front' } })
    expect(assist).toMatchObject({ type: 'assist', actionId: kill.actionId })
    expect(await score()).toMatchObject({ us: 1, them: 0 })
  })

  it('lets you skip the assist question', async () => {
    const user = await openLiveScreen()
    await tapPlayer(user, 4)
    await user.click(group(/^Attack/).getByRole('button', { name: 'Kill' }))
    await user.click(within(await screen.findByRole('region', { name: 'Assist by?' })).getByRole('button', { name: 'No one' }))
    expect(screen.queryByRole('region', { name: 'Assist by?' })).toBe(null)
  })

  it('marks attacks by back-row players as back row', async () => {
    const user = await openLiveScreen()
    await tapPlayer(user, 5)
    await user.click(group('Attack, back row').getByRole('button', { name: 'In play' }))
    await screen.findByText('Last: #5 Olly Outside: attack in play')
    expect((await savedEvents()).at(-1)).toMatchObject({ type: 'attack', result: 'in_play', detail: { row: 'back' } })
  })

  it('shows serve buttons only for the server, and remembers their serve type', async () => {
    const user = await openLiveScreen('us')
    await tapPlayer(user, 2)
    expect(screen.queryByRole('group', { name: 'Serve' })).toBe(null)
    await tapPlayer(user, 1)

    expect(group('Serve type').getByRole('button', { name: 'Jump float' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(group('Serve type').getByRole('button', { name: 'Jump spin' }))
    await user.click(group('Serve').getByRole('button', { name: 'Ace' }))
    await screen.findByText('Last: #1 Sam Setter: ace')
    expect((await savedEvents()).at(-1)).toMatchObject({ type: 'serve', result: 'ace', detail: { serveType: 'jump_spin' } })

    await tapPlayer(user, 1) // still serving after an ace
    expect(group('Serve type').getByRole('button', { name: 'Jump spin' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('shows pass buttons only on their serve', async () => {
    const user = await openLiveScreen('them')
    await tapPlayer(user, 5)
    await user.click(group('Pass').getByRole('button', { name: '0' }))
    await screen.findByText('Last: #5 Olly Outside: pass 0')
    expect(await score()).toMatchObject({ us: 0, them: 1 }) // a 0 pass means we were aced
  })

  it('hides pass buttons on our serve', async () => {
    const user = await openLiveScreen('us')
    await tapPlayer(user, 5)
    expect(screen.queryByRole('group', { name: 'Pass' })).toBe(null)
  })

  it('shows block buttons only for the front row', async () => {
    const user = await openLiveScreen()
    await tapPlayer(user, 5)
    expect(screen.queryByRole('group', { name: 'Block' })).toBe(null)
    await tapPlayer(user, 3)
    expect(screen.getByRole('group', { name: 'Block' })).toBeTruthy()
  })

  it('asks who else blocked, and scores a block assist once', async () => {
    const user = await openLiveScreen()
    await tapPlayer(user, 3)
    await user.click(group('Block').getByRole('button', { name: 'Assist' }))
    await user.click(
      within(await screen.findByRole('region', { name: 'Who else blocked?' })).getByRole('button', { name: '#2 Oscar Outside' }),
    )
    await user.click(within(await screen.findByRole('region', { name: 'Anyone else?' })).getByRole('button', { name: 'Done' }))

    expect(screen.queryByRole('region', { name: 'Anyone else?' })).toBe(null)
    const blocks = (await savedEvents()).filter((e) => e.type === 'block')
    expect(blocks.map((e) => e.playerId)).toEqual([players[2].id, players[1].id])
    expect(await score()).toMatchObject({ us: 1, them: 0 })
  })

  it('records their point and their error', async () => {
    const user = await openLiveScreen()
    await user.click(screen.getByRole('button', { name: 'Their point' }))
    await screen.findByText('Last: Their point')
    await user.click(screen.getByRole('button', { name: 'Their error' }))
    await screen.findByText('Last: Their error')
    expect(await score()).toMatchObject({ us: 1, them: 1 })
  })

  it('undoes the last tap', async () => {
    const user = await openLiveScreen()
    await user.click(screen.getByRole('button', { name: 'Their point' }))
    await screen.findByText('Last: Their point')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await screen.findByText('Last: Set 1 started')
    expect(await score()).toMatchObject({ us: 0, them: 0 })
  })

  it('cancels a selected player', async () => {
    const user = await openLiveScreen()
    await tapPlayer(user, 4)
    expect(screen.getByRole('region', { name: 'Stats for #4 Otto Opposite' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Tap a player, then what they did.')).toBeTruthy()
  })

  it('still asks for the assist after the kill that wins the set', async () => {
    const user = await openLiveScreen('us', async () => {
      for (let i = 0; i < 24; i++) await recordTap(db, match, { type: 'their_error' })
    })
    await tapPlayer(user, 4)
    await user.click(group(/^Attack/).getByRole('button', { name: 'Kill' }))

    expect(await screen.findByRole('heading', { name: 'Set 2 lineup' })).toBeTruthy()
    await user.click(within(screen.getByRole('region', { name: 'Assist by?' })).getByRole('button', { name: '#1 Sam Setter' }))
    await screen.findByText(/Set 1 final/)
    expect((await savedEvents()).at(-1)).toMatchObject({ type: 'assist', playerId: players[0].id })
  })
})

describe('subs and the libero', () => {
  it('makes a substitution', async () => {
    const user = await openLiveScreen()
    await user.click(screen.getByRole('button', { name: 'Subs' }))
    await user.selectOptions(screen.getByLabelText('Coming out'), '#4 Otto Opposite')
    await user.selectOptions(screen.getByLabelText('Going in'), '#8 Ben Bench')
    await user.click(screen.getByRole('button', { name: 'Make sub' }))

    expect(await screen.findByRole('button', { name: /^#8 Ben Bench/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^#4 Otto Opposite/ })).toBe(null)
  })

  it('says what’s missing for a sub', async () => {
    const user = await openLiveScreen()
    await user.click(screen.getByRole('button', { name: 'Subs' }))
    await user.click(screen.getByRole('button', { name: 'Make sub' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Pick who comes out and who goes in')
  })

  it('swaps the libero in for a back-row player and back out', async () => {
    const user = await openLiveScreen()
    await user.click(screen.getByRole('button', { name: 'Subs' }))
    await user.click(screen.getByRole('button', { name: 'Libero in for #6 Mo Middle' }))
    expect(await screen.findByRole('button', { name: /^#7 Lee Libero/ })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Subs' }))
    await user.click(screen.getByRole('button', { name: 'Libero out, #6 Mo Middle back in' }))
    expect(await screen.findByRole('button', { name: /^#6 Mo Middle/ })).toBeTruthy()
  })
})
