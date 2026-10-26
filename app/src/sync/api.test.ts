// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fakeServer, noConnection } from '../test/fakeServer.ts'
import '../test/renderApp.tsx' // puts the real fetch back after each test
import { ApiError, apiRequest, OfflineError, serverAddress } from './api.ts'

describe('talking to the server', () => {
  it('uses the server on the same computer while developing', () => {
    expect(serverAddress()).toBe(`http://${location.hostname}:8000`)
  })

  it('returns the JSON reply', async () => {
    fakeServer(() => ({ body: { status: 'ok' } }))
    expect(await apiRequest('/health')).toEqual({ status: 'ok' })
  })

  it("passes on the server's reason for saying no", async () => {
    fakeServer(() => ({ status: 409, body: { detail: 'An account with that email already exists' } }))
    const error = await apiRequest('/auth/signup', { method: 'POST', body: {} }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'An account with that email already exists' })
  })

  it('names the field when the server says one is invalid', async () => {
    const detail = [{ loc: ['body', 'password'], msg: 'String should have at least 8 characters' }]
    fakeServer(() => ({ status: 422, body: { detail } }))
    await expect(apiRequest('/auth/signup', { method: 'POST', body: {} })).rejects.toThrow(
      'password: String should have at least 8 characters',
    )
  })

  it("explains an error page that isn't JSON", async () => {
    vi.stubGlobal('fetch', async () => new Response('<h1>Bad gateway</h1>', { status: 502 }))
    await expect(apiRequest('/health')).rejects.toThrow('The server had a problem (error 502). Try again later.')
  })

  it('reports no connection as offline', async () => {
    noConnection()
    await expect(apiRequest('/health')).rejects.toBeInstanceOf(OfflineError)
  })
})
