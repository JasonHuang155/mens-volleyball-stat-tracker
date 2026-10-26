import { describe, expect, it } from 'vitest'
import { testLogin } from '../test/fakeServer.ts'
import { describePending, describeSync } from './describeSync.ts'

const loggedIn = { hasServer: true, login: testLogin(), pending: { taps: 0, changes: 0 }, phase: 'idle', problem: null } as const

describe('the upload status line', () => {
  it('says when everything has reached the server', () => {
    expect(describeSync(loggedIn)).toEqual({ text: 'Everything is uploaded', tone: 'good' })
  })

  it('counts what is waiting', () => {
    expect(describeSync({ ...loggedIn, pending: { taps: 12, changes: 0 } }).text).toBe('12 taps waiting to upload')
  })

  it('says nothing is lost while offline', () => {
    expect(describeSync({ ...loggedIn, phase: 'offline', pending: { taps: 1, changes: 0 } }).text).toBe(
      "Offline. 1 tap will upload when you're back online.",
    )
  })

  it("passes on the server's reason for refusing", () => {
    const summary = describeSync({ ...loggedIn, phase: 'problem', problem: 'Only one device can record a match.' })
    expect(summary).toEqual({ text: 'Upload stopped: Only one device can record a match.', tone: 'problem' })
  })

  it('suggests logging in', () => {
    expect(describeSync({ ...loggedIn, login: null }).text).toBe('Saved on this phone only. Log in to back up your stats.')
  })

  it('says why you were logged out', () => {
    const summary = describeSync({ ...loggedIn, login: null, problem: 'Your login ran out.' })
    expect(summary).toEqual({ text: 'Your login ran out.', tone: 'problem' })
  })
})

describe('describing what is waiting', () => {
  it.each([
    [0, 0, ''],
    [1, 0, '1 tap'],
    [12, 0, '12 taps'],
    [0, 1, '1 change'],
    [0, 3, '3 changes'],
    [12, 2, '12 taps and 2 other changes'],
  ])('%i taps and %i changes: "%s"', (taps, changes, text) => {
    expect(describePending({ taps, changes })).toBe(text)
  })
})
