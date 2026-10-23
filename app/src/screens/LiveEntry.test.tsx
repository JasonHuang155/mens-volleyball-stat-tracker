// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { db } from '../db/database.ts'
import { getEvents, recordTap } from '../db/matches.ts'
import { replay } from '../domain/replay.ts'
import type { Side } from '../domain/types.ts'
import { activeEvents } from '../domain/undo.ts'
import { setUpMatch, startSet, type Fixture } from '../test/fixtures.ts'
import { renderApp } from '../test/renderApp.tsx'

// Huskies (home): #1 Sam Setter serves first, #2-#4 front row, #5 and #6 back row, #7 libero, #8 bench.
// Rivals (away): #10 in position 1, #11-#13 front row, #14 and #15 back row, #16 libero, #17 bench.

let fixture: Fixture

/** Starts set 1 and opens the match screen. `beforeOpen` can add taps first. */
async function openLiveScreen(firstServe: Side = 'home', beforeOpen?: () => Promise<void>) {
  fixture = await setUpMatch()
  await startSet(fixture, firstServe)
  await beforeOpen?.()
  const { user } = renderApp(`/matches/${fixture.match.id}`)
  await screen.findByText(/Last:/)
  return user
}

async function savedEvents() {
  return activeEvents(await getEvents(db, fixture.match.id))
}

async function score() {
  const state = replay(fixture.match, await getEvents(db, fixture.match.id))
  return state.sets[state.sets.length - 1]
}

/** Taps a player on the court, e.g. tapPlayer(user, 'Huskies', '#4 Otto Opposite'). */
function tapPlayer(user: UserEvent, team: string, label: string) {
  return user.click(screen.getByRole('button', { name: new RegExp(`^${team} ${label}(,|$)`) }))
}

function group(name: string | RegExp) {
  return within(screen.getByRole('group', { name }))
}

function question(name: string) {
  return within(screen.getByRole('region', { name }))
}

describe('recording stats', () => {
  it('records a kill in two taps, then asks who set it', async () => {
    const user = await openLiveScreen()
    await tapPlayer(user, 'Huskies', '#4 Otto Opposite')
    await user.click(group(/^Attack/).getByRole('button', { name: 'Kill' }))

    await screen.findByRole('region', { name: 'Assist by?' })
    expect(question('Assist by?').getAllByRole('button')[0].getAttribute('aria-label')).toBe('#1 Sam Setter')
    await user.click(question('Assist by?').getByRole('button', { name: '#1 Sam Setter' }))

    await screen.findByText('Last: Huskies #1 Sam Setter: assist')
    expect(screen.queryByRole('region', { name: 'Assist by?' })).toBe(null)
    const [, kill, assist] = await savedEvents()
    expect(kill).toMatchObject({ type: 'attack', side: 'home', result: 'kill', detail: { row: 'front' } })
    expect(assist).toMatchObject({ type: 'assist', actionId: kill.actionId })
    expect(await score()).toMatchObject({ home: 1, away: 0 })
  })

  it('lets you skip the question', async () => {
    const user = await openLiveScreen()
    await tapPlayer(user, 'Huskies', '#4 Otto Opposite')
    await user.click(group(/^Attack/).getByRole('button', { name: 'Kill' }))
    await user.click(await screen.findByRole('button', { name: 'No assist' }))
    expect(screen.queryByRole('region', { name: 'Assist by?' })).toBe(null)
    expect(screen.getByText('Tap a player, then what they did.')).toBeTruthy() // the team buttons are back
  })

  it('marks attacks by back-row players as back row', async () => {
    const user = await openLiveScreen()
    await tapPlayer(user, 'Huskies', '#5 Olly Outside')
    await user.click(group('Attack, back row').getByRole('button', { name: 'In play' }))
    await screen.findByText('Last: Huskies #5 Olly Outside: attack in play')
    expect((await savedEvents()).at(-1)).toMatchObject({ detail: { row: 'back' } })
  })

  it('shows serve buttons only for the server, and remembers their serve type', async () => {
    const user = await openLiveScreen('home')
    await tapPlayer(user, 'Huskies', '#2 Oscar Outside')
    expect(screen.queryByRole('group', { name: 'Serve' })).toBe(null)
    await tapPlayer(user, 'Huskies', '#1 Sam Setter')

    expect(group('Serve type').getByRole('button', { name: 'Jump float' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(group('Serve type').getByRole('button', { name: 'Jump spin' }))
    await user.click(group('Serve').getByRole('button', { name: 'Ace' }))
    await user.click(await screen.findByRole('button', { name: 'Untouched' }))
    expect((await savedEvents()).at(-1)).toMatchObject({ type: 'serve', result: 'ace', detail: { serveType: 'jump_spin' } })

    await tapPlayer(user, 'Huskies', '#1 Sam Setter') // still serving after an ace
    expect(group('Serve type').getByRole('button', { name: 'Jump spin' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('records the server’s team as getting the point, for either team', async () => {
    const user = await openLiveScreen('away')
    await tapPlayer(user, 'Rivals', '#10')
    await user.click(group('Serve').getByRole('button', { name: 'Error' }))
    await screen.findByText('Last: Rivals #10: serve error')
    expect(await score()).toMatchObject({ home: 1, away: 0 })
  })
})

describe('plays involving both teams', () => {
  it('asks who was aced, and gives that player a reception error', async () => {
    const user = await openLiveScreen('home')
    await tapPlayer(user, 'Huskies', '#1 Sam Setter')
    await user.click(group('Serve').getByRole('button', { name: 'Ace' }))
    await user.click(within(await screen.findByRole('region', { name: 'Who was aced?' })).getByRole('button', { name: '#14' }))

    await screen.findByText('Last: Rivals #14: reception error')
    const [, ace, receptionError] = await savedEvents()
    expect(receptionError).toMatchObject({ type: 'pass', side: 'away', result: 0, actionId: ace.actionId })
    expect(await score()).toMatchObject({ home: 1, away: 0 })
  })

  it('gives the server the ace when you record a 0 pass', async () => {
    const user = await openLiveScreen('away')
    await tapPlayer(user, 'Huskies', '#5 Olly Outside')
    await user.click(group('Pass').getByRole('button', { name: '0' }))

    await screen.findByText('Last: Rivals #10: ace')
    const [, pass, ace] = await savedEvents()
    expect(pass).toMatchObject({ type: 'pass', side: 'home', result: 0 })
    expect(ace).toMatchObject({ type: 'serve', side: 'away', result: 'ace', actionId: pass.actionId })
    expect(await score()).toMatchObject({ home: 0, away: 1 })
  })

  it('hides pass buttons on your own team’s serve', async () => {
    const user = await openLiveScreen('home')
    await tapPlayer(user, 'Huskies', '#5 Olly Outside')
    expect(screen.queryByRole('group', { name: 'Pass' })).toBe(null)
  })

  it('shows block buttons only for the front row', async () => {
    const user = await openLiveScreen()
    await tapPlayer(user, 'Huskies', '#5 Olly Outside')
    expect(screen.queryByRole('group', { name: 'Block' })).toBe(null)
    await tapPlayer(user, 'Rivals', '#12')
    expect(screen.getByRole('group', { name: 'Block' })).toBeTruthy()
  })

  it('asks who blocked an attack error; two blockers each get a block assist', async () => {
    const user = await openLiveScreen('home')
    await tapPlayer(user, 'Rivals', '#13')
    await user.click(group(/^Attack/).getByRole('button', { name: 'Error' }))

    await screen.findByRole('region', { name: 'Blocked by?' })
    await user.click(question('Blocked by?').getByRole('button', { name: '#3 Max Middle' }))
    await user.click(question('Blocked by?').getByRole('button', { name: '#2 Oscar Outside' }))
    await user.click(question('Blocked by?').getByRole('button', { name: 'Save' }))

    await screen.findByText(/Last: Huskies #2 Oscar Outside: block assist/)
    const blocks = (await savedEvents()).filter((e) => e.type === 'block')
    expect(blocks.map((e) => e.type === 'block' && e.result)).toEqual(['assist', 'assist'])
    expect(await score()).toMatchObject({ home: 1, away: 0 })
  })

  it('makes one blocker a solo block', async () => {
    const user = await openLiveScreen('home')
    await tapPlayer(user, 'Rivals', '#13')
    await user.click(group(/^Attack/).getByRole('button', { name: 'Error' }))
    await user.click(within(await screen.findByRole('region', { name: 'Blocked by?' })).getByRole('button', { name: '#3 Max Middle' }))
    await user.click(question('Blocked by?').getByRole('button', { name: 'Save' }))
    await screen.findByText('Last: Huskies #3 Max Middle: solo block')
  })

  it('offers the blockers who were in the front row when the play happened', async () => {
    // Rivals serve. A Rivals attack error wins Huskies the serve back, and Huskies rotate:
    // #2 moves to the back row. But #2 was in the front row for the block.
    const user = await openLiveScreen('away')
    await tapPlayer(user, 'Rivals', '#13')
    await user.click(group(/^Attack/).getByRole('button', { name: 'Error' }))
    await screen.findByRole('region', { name: 'Blocked by?' })
    const blockers = question('Blocked by?')
    expect(blockers.getByRole('button', { name: '#2 Oscar Outside' })).toBeTruthy()
    expect(blockers.queryByRole('button', { name: '#5 Olly Outside' })).toBe(null)
  })

  it('after a block assist, asks who else blocked and then whose attack it was', async () => {
    const user = await openLiveScreen('home')
    await tapPlayer(user, 'Huskies', '#3 Max Middle')
    await user.click(group('Block').getByRole('button', { name: 'Assist' }))

    await user.click(within(await screen.findByRole('region', { name: 'Who else blocked?' })).getByRole('button', { name: '#4 Otto Opposite' }))
    await user.click(question('Who else blocked?').getByRole('button', { name: 'Save' }))
    await user.click(within(await screen.findByRole('region', { name: 'Whose attack?' })).getByRole('button', { name: '#12' }))

    await screen.findByText('Last: Rivals #12: attack error')
    expect(await score()).toMatchObject({ home: 1, away: 0 })
  })

  it('records a point with no stat for either team', async () => {
    const user = await openLiveScreen()
    await user.click(screen.getByRole('button', { name: 'Point to Rivals, no stat' }))
    await screen.findByText('Last: Point to Rivals')
    await user.click(screen.getByRole('button', { name: 'Point to Huskies, no stat' }))
    await screen.findByText('Last: Point to Huskies')
    expect(await score()).toMatchObject({ home: 1, away: 1 })
  })

  it('still asks for the assist after the kill that wins the set', async () => {
    const user = await openLiveScreen('home', async () => {
      for (let i = 0; i < 24; i++) await recordTap(db, fixture.match, { type: 'point', side: 'home' })
    })
    await tapPlayer(user, 'Huskies', '#4 Otto Opposite')
    await user.click(group(/^Attack/).getByRole('button', { name: 'Kill' }))

    expect(await screen.findByRole('heading', { name: 'Set 2 lineups' })).toBeTruthy()
    await user.click(question('Assist by?').getByRole('button', { name: '#1 Sam Setter' }))
    await screen.findByText(/Set 1 final/)
    expect((await savedEvents()).at(-1)).toMatchObject({ type: 'assist', playerId: fixture.players.home[0].id })
  })
})

describe('undo and cancel', () => {
  it('undoes a whole linked play', async () => {
    const user = await openLiveScreen('away')
    await tapPlayer(user, 'Huskies', '#5 Olly Outside')
    await user.click(group('Pass').getByRole('button', { name: '0' }))
    await screen.findByText('Last: Rivals #10: ace')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await screen.findByText('Last: Set 1 started')
    expect(await score()).toMatchObject({ home: 0, away: 0 })
  })

  it('cancels a selected player', async () => {
    const user = await openLiveScreen()
    await tapPlayer(user, 'Huskies', '#4 Otto Opposite')
    expect(screen.getByRole('region', { name: 'Stats for Huskies #4 Otto Opposite' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Tap a player, then what they did.')).toBeTruthy()
  })
})

describe('subs and the libero', () => {
  it('makes a substitution for either team', async () => {
    const user = await openLiveScreen()
    await user.click(screen.getByRole('button', { name: 'Subs' }))
    await user.click(screen.getByRole('radio', { name: 'Rivals' }))
    await user.selectOptions(screen.getByLabelText('Coming out'), '#13')
    await user.selectOptions(screen.getByLabelText('Going in'), '#17')
    await user.click(screen.getByRole('button', { name: 'Make sub' }))

    expect(await screen.findByRole('button', { name: /^Rivals #17/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Rivals #13/ })).toBe(null)
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
    expect(await screen.findByRole('button', { name: /^Huskies #7 Lee Libero/ })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Subs' }))
    await user.click(screen.getByRole('button', { name: 'Libero out, #6 Mo Middle back in' }))
    expect(await screen.findByRole('button', { name: /^Huskies #6 Mo Middle/ })).toBeTruthy()
  })
})
