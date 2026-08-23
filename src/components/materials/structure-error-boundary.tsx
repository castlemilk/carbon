'use client'

import { Component, type ReactNode } from 'react'

import { Card, CardContent } from '@/components/ui/card'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

// keeps a structure-viewer crash from taking down the material detail page
export default class StructureErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            The interactive structure viewer could not be loaded.
          </CardContent>
        </Card>
      )
    }
    return this.props.children
  }
}
