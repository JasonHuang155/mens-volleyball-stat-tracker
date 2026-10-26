// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db } from '../db/database.ts'
import { recordTap } from '../db/matches.ts'
import { fakeServer, noConnection, testLogin } from '../test/fakeServer.ts'
import { setUpMatch, startSet } from '../test/fixtures.ts'
import { renderApp } from '../test/renderApp.tsx'
import { loadLogin, saveLogin } from './login.ts'

// Uploads start a second after a change, so these tests wait a little longer than usual.
const UPLOAD_WAIT = { timeout: 4000 }

/** Two teams, a match, and its first two taps (the set start and a point), with Sam logged in. */
async function loggedInWithAMatch() {
  const fixture = await setUpMatch()
  await startSet(fixture)
  await recordTap(db, fixture.match, { type: 'point', side: 'home' })
  saveLogin(testLogin())
  return fixture
}

describe('uploading in the background', () => {
  it('says stats stay on the phone until you log in', async () => {
    renderApp('/')
    const status = await screen.findByRole('link', { name: 'Saved on this phone only. Log in to back up your stats.' })
    expect(status.getAttribute('href')).toBe('/account')
  })

  it('uploads everything once you are logged in', async () => {
    await loggedInWithAMatch()
    const requests = fakeServer()
    renderApp('/')

    expect(await screen.findByText('Everything is uploaded', {}, UPLOAD_WAIT)).toBeTruthy()
    expect(requests.map((r) => [r.method, r.path, r.authorization])).toEqual([
      ['POST', '/sync/upload', 'Bearer test-token'],
      ['POST', '/sync/upload', 'Bearer test-token'],
    ])
    expect(requests[0].body.teams).toHaveLength(2)
    expect(requests[1].body.events.map((tap: { seq: number }) => tap.seq)).toEqual([1, 2])
  })

  it('uploads new taps as they are recorded', async () => {
    const fixture = await loggedInWithAMatch()
    const requests = fakeServer()
    renderApp('/')
    await screen.findByText('Everything is uploaded', {}, UPLOAD_WAIT)

    await recordTap(db, fixture.match, { type: 'point', side: 'away' })
    await waitFor(() => expect(requests).toHaveLength(3), UPLOAD_WAIT)
    expect(requests[2].body.events.map((tap: { seq: number }) => tap.seq)).toEqual([3])
  })

  it('keeps everything on the phone while offline', async () => {
    await loggedInWithAMatch()
    noConnection()
    renderApp('/')
    expect(
      await screen.findByText(
        "Offline. 2 taps and 19 other changes will upload when you're back online.",
        {},
        UPLOAD_WAIT,
      ),
    ).toBeTruthy()
  })

  it("shows the server's reason when it refuses an upload", async () => {
    await loggedInWithAMatch()
    fakeServer(({ body }) =>
      body.events ? { status: 409, body: { detail: 'Another device has already recorded taps for this match.' } } : {},
    )
    renderApp('/')
    expect(
      await screen.findByText('Upload stopped: Another device has already recorded taps for this match.', {}, UPLOAD_WAIT),
    ).toBeTruthy()
  })

  it('asks you to log in again when your login has run out', async () => {
    await loggedInWithAMatch()
    fakeServer(() => ({ status: 401, body: { detail: "Your login has expired or isn't valid. Log in again." } }))
    renderApp('/')
    expect(await screen.findByText('Your login ran out. Log in again to keep uploading.', {}, UPLOAD_WAIT)).toBeTruthy()
    expect(loadLogin()).toBeNull()
  })
})
