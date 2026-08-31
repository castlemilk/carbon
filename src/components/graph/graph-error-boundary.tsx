'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback: (error: Error, reset: () => void) => ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
  resetKey?: string | number
}

interface State {
  failed: boolean
  error: Error | null
}

export default class GraphErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { failed: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.reset()
    }
  }

  reset = (): void => {
    this.setState({ failed: false, error: null })
  }

  render(): ReactNode {
    if (this.state.failed && this.state.error) {
      return this.props.fallback(this.state.error, this.reset)
    }
    return this.props.children
  }
}
