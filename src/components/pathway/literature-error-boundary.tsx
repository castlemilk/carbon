'use client'

import { Component, type ReactNode } from 'react'

import { Card, CardContent } from '@/components/ui/card'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

// keeps a literature-panel crash from taking down the whole detail page
export default class LiteratureErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Literature could not be loaded.
          </CardContent>
        </Card>
      )
    }
    return this.props.children
  }
}
