import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

const root = document.getElementById('root')!
root.dataset.started = 'true' // tells the error message in index.html that the app is running

// On GitHub Pages the app lives under /<repository-name>/, so screen addresses start there.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
