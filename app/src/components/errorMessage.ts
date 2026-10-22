/** The text to show for something that went wrong, e.g. "#7 is already Max Middle's number". */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}
