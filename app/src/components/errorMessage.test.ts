import { describe, expect, it } from 'vitest'
import { MatchScript } from '../test/matchScript.ts'
import { errorMessage } from './errorMessage.ts'

describe('errorMessage', () => {
  it('shows the plain reason when a tap breaks the rules, without the event details', () => {
    let caught: unknown
    try {
      new MatchScript().point('home')
    } catch (error) {
      caught = error
    }
    expect(errorMessage(caught)).toBe('No set is in progress')
  })

  it('shows other errors as they are, starting with a capital letter', () => {
    expect(errorMessage(new Error("#7 is already Max Middle's number"))).toBe("#7 is already Max Middle's number")
    expect(errorMessage(new Error('an assist can only be added to a kill'))).toBe('An assist can only be added to a kill')
  })

  it('has a fallback for anything else', () => {
    expect(errorMessage('oops')).toBe('Something went wrong. Try again.')
  })
})
