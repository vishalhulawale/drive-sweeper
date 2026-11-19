import Alert from '@cloudscape-design/components/alert'
import Button from '@cloudscape-design/components/button'
import { Component, type ReactNode } from 'react'

/** Keeps a crash inside one page: the shell stays, and the page offers a reload. Give it key={route} to reset on navigation. */
export default class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Alert
        type="error"
        header="This page stopped working"
        action={<Button onClick={() => window.location.reload()}>Reload page</Button>}
      >
        Your data is safe; nothing was changed in Drive. Reload the page to try again. Details: {this.state.error.message}
      </Alert>
    )
  }
}
