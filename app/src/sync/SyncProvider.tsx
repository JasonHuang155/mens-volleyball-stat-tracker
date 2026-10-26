import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { errorMessage } from '../components/errorMessage.ts'
import { db } from '../db/database.ts'
import { ApiError, OfflineError, apiRequest, serverAddress } from './api.ts'
import { clearLogin, lastUploader, loadLogin, logIn as requestLogin, saveLogin, setLastUploader } from './login.ts'
import { forgetUploads, pendingUploads, uploadPending } from './upload.ts'
import { SyncContext, type Sync, type SyncPhase } from './useSync.ts'

/** Waits this long after a change before uploading, so a burst of taps goes up together. */
const UPLOAD_DELAY_MS = 1000
/** After an upload fails, tries again this often (and as soon as the phone is back online). */
const RETRY_MS = 30_000

/**
 * Keeps the login and uploads in the background while you're logged in. Taps are
 * always saved on the phone first; uploading copies them to the server when it can.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [login, setLogin] = useState(loadLogin)
  const [phase, setPhase] = useState<SyncPhase>('idle')
  const [problem, setProblem] = useState<string | null>(null)
  const pending = useLiveQuery(() => pendingUploads(db))
  const waiting = pending ? pending.taps + pending.changes : 0

  // Refs hold values that outlive a single render without causing one.
  const loginRef = useRef(login)
  const running = useRef(false)
  const runAgain = useRef(false)
  useEffect(() => {
    loginRef.current = login
  }, [login])

  const upload = useCallback(async () => {
    const current = loginRef.current
    if (!current) return
    if (running.current) {
      runAgain.current = true // something changed mid-upload: go round once more when this one ends
      return
    }
    running.current = true
    setPhase('uploading')
    const send = (batch: unknown) =>
      apiRequest('/sync/upload', { method: 'POST', body: batch, token: current.accessToken })
    try {
      do {
        runAgain.current = false
        await uploadPending(db, send)
      } while (runAgain.current)
      setPhase('idle')
      setProblem(null)
    } catch (error) {
      if (error instanceof OfflineError) {
        setPhase('offline')
        setProblem(null)
      } else if (error instanceof ApiError && error.status === 401) {
        clearLogin()
        setLogin(null)
        setPhase('idle')
        setProblem('Your login ran out. Log in again to keep uploading.')
      } else {
        setPhase('problem')
        setProblem(errorMessage(error))
      }
    } finally {
      running.current = false
    }
  }, [])

  // Upload shortly after anything is saved, and right after logging in.
  useEffect(() => {
    if (!login || waiting === 0) return
    const timer = setTimeout(upload, UPLOAD_DELAY_MS)
    return () => clearTimeout(timer)
  }, [login, waiting, upload])

  // After a failed upload, keep trying every so often, and as soon as the phone is back online.
  useEffect(() => {
    if (!login || (phase !== 'offline' && phase !== 'problem')) return
    const timer = setInterval(upload, RETRY_MS)
    window.addEventListener('online', upload)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', upload)
    }
  }, [login, phase, upload])

  const logIn = useCallback(async (mode: 'login' | 'signup', email: string, password: string) => {
    const newLogin = await requestLogin(mode, email, password)
    // If this phone uploaded to a different account before, upload everything again to this one.
    // (If it's the same account after all, the server just says it already has it all.)
    if (lastUploader() !== newLogin.user.id) {
      await forgetUploads(db)
      setLastUploader(newLogin.user.id)
    }
    saveLogin(newLogin)
    setLogin(newLogin)
    setPhase('idle')
    setProblem(null)
  }, [])

  const logOut = useCallback(() => {
    clearLogin()
    setLogin(null)
    setPhase('idle')
    setProblem(null)
  }, [])

  const sync: Sync = {
    hasServer: serverAddress() !== null,
    login,
    pending,
    phase,
    problem,
    logIn,
    logOut,
    uploadNow: upload,
  }
  return <SyncContext value={sync}>{children}</SyncContext>
}
