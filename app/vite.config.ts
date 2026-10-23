import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // Where the app lives on the web server. "/" locally; GitHub Pages serves it from
  // /<repository-name>/, which the publish workflow passes in as BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  test: {
    setupFiles: ['./src/test/setup.ts'],
  },
})
