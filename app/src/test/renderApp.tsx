import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import App from '../App.tsx'
import { db } from '../db/database.ts'

// Every screen test starts with an empty database and a blank page, with nobody
// logged in and the real fetch back in place of any pretend server (test/fakeServer.ts).
beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

/**
 * Shows the app at a web address, like opening that page in a browser.
 * `user` taps and types the way a person would: user.click(...), user.type(...).
 */
export function renderApp(path = '/') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
  return { user }
}
