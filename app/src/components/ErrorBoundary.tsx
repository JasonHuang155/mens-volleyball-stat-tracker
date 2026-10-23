import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * If a screen crashes, show what went wrong instead of a blank page.
 * React only offers this as a class component, which is why it looks different.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="screen">
        <h1>Something went wrong</h1>
        <p>The app hit an error. Your saved taps are safe. Reloading usually fixes it.</p>
        <pre className="error-details">
          {this.state.error.name}: {this.state.error.message}
        </pre>
        <button className="button button-primary" type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    )
  }
}

export default ErrorBoundary
