import type { MatchEvent } from './types.ts'

/**
 * The events that still count, in order: everything except undo events and
 * the actions they cancelled. Nothing is ever deleted from the list itself.
 */
export function activeEvents(events: MatchEvent[]): MatchEvent[] {
  const undone = new Set<string>()
  for (const event of events) {
    if (event.type === 'undo') undone.add(event.detail.voidsActionId)
  }
  return events
    .filter((event) => event.type !== 'undo' && !undone.has(event.actionId))
    .sort((a, b) => a.seq - b.seq)
}

/** The most recent event that still counts, or null if there isn't one. */
export function lastActiveEvent(events: MatchEvent[]): MatchEvent | null {
  const active = activeEvents(events)
  return active.length > 0 ? active[active.length - 1] : null
}
