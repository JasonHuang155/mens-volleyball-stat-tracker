// Settings Vite reads from the environment when it builds the app. Only names starting with VITE_ are included.
interface ImportMetaEnv {
  /** The server's address, e.g. https://volleyball-api.example.com. Not set: see serverAddress() in sync/api.ts. */
  readonly VITE_API_URL?: string
}
