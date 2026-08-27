'use client'

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

// Keeps a malformed or unexpectedly incompatible diagram from taking down the detail page.
export default class MermaidErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="rounded-lg border border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
          The process diagram could not be rendered. The mechanism description above remains available.
        </p>
      )
    }
    return this.props.children
  }
}
