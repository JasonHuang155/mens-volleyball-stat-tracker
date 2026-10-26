// Talking to the server (the FastAPI code in api/). Every request goes through apiRequest,
// which turns the ways a request can fail into errors the screens can show.

/** The server answered, but said no. `message` is the server's own explanation. */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** The server couldn't be reached at all: no signal, or the server is down. */
export class OfflineError extends Error {
  constructor() {
    super("Can't reach the server")
  }
}

/**
 * Where the server is, or null if this copy of the app has no server.
 * The published app is told its server when it's built (VITE_API_URL). While developing,
 * the server runs on the same computer as the app, on port 8000; using the page's own
 * hostname means a phone on your Wi-Fi reaches your computer, not itself.
 */
export function serverAddress(): string | null {
  const configured = import.meta.env.VITE_API_URL
  if (configured) return configured.replace(/\/$/, '')
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:8000`
  return null
}

type RequestOptions = { method?: 'GET' | 'POST'; body?: unknown; token?: string }

/** Sends a request and returns the server's JSON reply. Throws ApiError or OfflineError. */
export async function apiRequest<T>(path: string, { method = 'GET', body, token }: RequestOptions = {}): Promise<T> {
  const server = serverAddress()
  if (!server) throw new Error("This copy of the app isn't connected to a server")

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(server + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Courtside Wi-Fi can hang instead of failing. Give up and try again later.
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new OfflineError()
  }
  if (!response.ok) throw new ApiError(response.status, await reasonFor(response))
  return (await response.json()) as T
}

/** The server's explanation for saying no, as a sentence. */
async function reasonFor(response: Response): Promise<string> {
  try {
    const body = await response.json()
    // FastAPI puts it in "detail": a sentence for the server's own checks, or a list
    // of fields that weren't valid ({loc: ['body', 'password'], msg: '...'}).
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail) && body.detail.length > 0) {
      const { loc, msg } = body.detail[0]
      return `${loc.at(-1)}: ${msg}`
    }
  } catch {
    // The reply wasn't JSON, e.g. an error page from the hosting service.
  }
  return `The server had a problem (error ${response.status}). Try again later.`
}
