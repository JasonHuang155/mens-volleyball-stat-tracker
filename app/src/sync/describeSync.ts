import type { Sync } from './useSync.ts'
import type { Pending } from './upload.ts'

export type SyncSummary = { text: string; tone: 'good' | 'waiting' | 'problem' }

/** One line saying where your stats are, e.g. "12 taps waiting to upload". */
export function describeSync({
  hasServer,
  login,
  pending,
  phase,
  problem,
}: Pick<Sync, 'hasServer' | 'login' | 'pending' | 'phase' | 'problem'>): SyncSummary {
  if (!hasServer) return { text: 'Saved on this phone. This copy of the app has no server.', tone: 'waiting' }
  if (!login) {
    if (problem) return { text: problem, tone: 'problem' }
    return { text: 'Saved on this phone only. Log in to back up your stats.', tone: 'waiting' }
  }
  if (phase === 'uploading') return { text: 'Uploading…', tone: 'waiting' }
  if (phase === 'problem') return { text: `Upload stopped: ${problem}`, tone: 'problem' }

  const waiting = pending && describePending(pending)
  if (phase === 'offline') {
    return { text: `Offline. ${waiting || 'Your changes'} will upload when you're back online.`, tone: 'waiting' }
  }
  if (pending === undefined) return { text: 'Checking for uploads…', tone: 'waiting' }
  if (waiting) return { text: `${waiting} waiting to upload`, tone: 'waiting' }
  return { text: 'Everything is uploaded', tone: 'good' }
}

/** "12 taps", "1 change", "12 taps and 2 other changes", or "" if nothing's waiting. */
export function describePending({ taps, changes }: Pending): string {
  const tapText = `${taps} ${taps === 1 ? 'tap' : 'taps'}`
  if (changes === 0) return taps === 0 ? '' : tapText
  const changeText = `${changes} ${taps > 0 ? 'other ' : ''}${changes === 1 ? 'change' : 'changes'}`
  return taps === 0 ? changeText : `${tapText} and ${changeText}`
}
