import { RuleError } from '../domain/replay.ts'

/** The text to show for something that went wrong, e.g. "#7 is already Max Middle's number". */
export function errorMessage(error: unknown): string {
  if (error instanceof RuleError) return capitalize(error.reason)
  if (error instanceof Error) return capitalize(error.message)
  return 'Something went wrong. Try again.'
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
