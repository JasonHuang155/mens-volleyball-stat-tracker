import { apiRequest } from './api.ts'

/** Who's logged in on this phone, and the token that proves it to the server. */
export type Login = {
  accessToken: string
  expiresAt: string
  user: { id: string; email: string }
}

const LOGIN_KEY = 'volleyball.login'
const UPLOADER_KEY = 'volleyball.uploadedFor'

/** Makes an account (`signup`) or logs in to one (`login`). */
export async function logIn(mode: 'login' | 'signup', email: string, password: string): Promise<Login> {
  const reply = await apiRequest<Login>(`/auth/${mode}`, { method: 'POST', body: { email, password } })
  return { accessToken: reply.accessToken, expiresAt: reply.expiresAt, user: reply.user }
}

// The login is kept in localStorage: a small store in the browser that survives closing
// the app. Some browsers block it (private browsing), so every use is allowed to fail.

/** The saved login, or null if nobody is logged in or the login has run out. */
export function loadLogin(now = new Date()): Login | null {
  try {
    const saved = localStorage.getItem(LOGIN_KEY)
    if (!saved) return null
    const login = JSON.parse(saved) as Login
    return new Date(login.expiresAt) > now ? login : null
  } catch {
    return null
  }
}

export function saveLogin(login: Login): void {
  try {
    localStorage.setItem(LOGIN_KEY, JSON.stringify(login))
  } catch {
    // Not saved: the login lasts until the app is closed.
  }
}

export function clearLogin(): void {
  try {
    localStorage.removeItem(LOGIN_KEY)
  } catch {
    // Nothing was saved.
  }
}

/** The account this phone's uploads went to, so logging in as someone else can start over. */
export function lastUploader(): string | null {
  try {
    return localStorage.getItem(UPLOADER_KEY)
  } catch {
    return null
  }
}

export function setLastUploader(userId: string): void {
  try {
    localStorage.setItem(UPLOADER_KEY, userId)
  } catch {
    // Not saved: the next login uploads everything again, which is safe.
  }
}
