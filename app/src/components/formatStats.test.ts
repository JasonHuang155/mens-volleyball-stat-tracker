import { describe, expect, it } from 'vitest'
import { formatAverage, formatHalf, formatHitting } from './formatStats.ts'

describe('formatHitting', () => {
  it('writes three decimals without a leading zero', () => {
    expect(formatHitting(1 / 3)).toBe('.333')
    expect(formatHitting(0.25)).toBe('.250')
    expect(formatHitting(0)).toBe('.000')
    expect(formatHitting(1)).toBe('1.000')
  })

  it('handles negative hitting', () => {
    expect(formatHitting(-0.1)).toBe('-.100')
    expect(formatHitting(-0.0001)).toBe('.000') // rounds to zero, so no minus sign
  })

  it('shows a dash when there were no attempts', () => {
    expect(formatHitting(null)).toBe('—')
  })
})

describe('formatAverage', () => {
  it('writes two decimals, or a dash when there were no passes', () => {
    expect(formatAverage(7 / 3)).toBe('2.33')
    expect(formatAverage(3)).toBe('3.00')
    expect(formatAverage(null)).toBe('—')
  })
})

describe('formatHalf', () => {
  it('only shows a decimal for halves', () => {
    expect(formatHalf(2)).toBe('2')
    expect(formatHalf(1.5)).toBe('1.5')
    expect(formatHalf(0)).toBe('0')
  })
})
