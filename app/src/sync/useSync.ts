import { createContext, useContext } from 'react'
import type { Login } from './login.ts'
import type { Pending } from './upload.ts'

/** What the uploader is doing: nothing to do (or waiting to start), uploading, or stuck. */
export type SyncPhase = 'idle' | 'uploading' | 'offline' | 'problem'

/** The login and upload status, shared with every screen by SyncProvider. */
export type Sync = {
  /** False if this copy of the app has no server to upload to. */
  hasServer: boolean
  login: Login | null
  /** What's waiting to upload. Undefined while it's being counted. */
  pending: Pending | undefined
  phase: SyncPhase
  /** Why uploading stopped, or why you were logged out. */
  problem: string | null
  logIn: (mode: 'login' | 'signup', email: string, password: string) => Promise<void>
  logOut: () => void
  uploadNow: () => void
}

export const SyncContext = createContext<Sync | null>(null)

/** The login and upload status, for any screen. */
export function useSync(): Sync {
  const sync = useContext(SyncContext)
  if (!sync) throw new Error('useSync needs a SyncProvider around the app')
  return sync
}
