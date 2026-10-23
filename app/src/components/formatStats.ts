// How stats are written in a box score.

const NO_VALUE = '—'

/** Hitting percentage the NCAA way: three decimals, no leading zero. 0.333 → ".333", -0.1 → "-.100". */
export function formatHitting(pct: number | null): string {
  if (pct === null) return NO_VALUE
  const text = pct.toFixed(3)
  if (text === '-0.000') return '.000'
  return text.replace(/^(-?)0\./, '$1.')
}

/** Pass average with two decimals: 2.3333 → "2.33". */
export function formatAverage(average: number | null): string {
  return average === null ? NO_VALUE : average.toFixed(2)
}

/** Stats that can end in a half (total blocks, points): 2 → "2", 1.5 → "1.5". */
export function formatHalf(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
