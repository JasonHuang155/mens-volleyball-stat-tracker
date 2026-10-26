import { vi } from 'vitest'
import type { Login } from '../sync/login.ts'

export type SentRequest = {
  method: string
  path: string
  /** Whatever JSON the app sent. */
  body: any
  authorization: string | undefined
}
export type Reply = { status?: number; body?: unknown }

/**
 * Swaps the browser's fetch for a pretend server, so tests never need the real one.
 * `answer` decides the reply to each request (by default, 200 with an empty object).
 * Returns the list of requests the app sends, to check afterwards.
 */
export function fakeServer(answer: (request: SentRequest) => Reply = () => ({})): SentRequest[] {
  const requests: SentRequest[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>
    const request: SentRequest = {
      method: init.method ?? 'GET',
      path: new URL(url).pathname,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      authorization: headers.Authorization,
    }
    requests.push(request)
    const { status = 200, body = {} } = answer(request)
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  })
  return requests
}

/** Swaps fetch for one that fails the way it does with no signal. */
export function noConnection(): void {
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('Failed to fetch')
  })
}

/** A login that lasts another day. */
export function testLogin(email = 'sam@example.com'): Login {
  return {
    accessToken: 'test-token',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    user: { id: 'user-1', email },
  }
}
