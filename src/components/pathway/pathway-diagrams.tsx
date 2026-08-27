'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import MermaidErrorBoundary from '@/components/pathway/mermaid-error-boundary'
import MermaidViewer from '@/components/pathway/mermaid-viewer'

interface Props {
  flowSource: string
  sequenceSource: string
}

export default function PathwayDiagrams({ flowSource, sequenceSource }: Props) {
  return (
    <Card data-testid="pathway-diagrams">
      <CardHeader className="gap-3">
        <div>
          <CardTitle>Process diagrams</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Follow the physical components first, then the operational handoffs that move carbon through the system.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="flow">
          <TabsList aria-label="Diagram type" variant="line">
            <TabsTrigger value="flow">System flow</TabsTrigger>
            <TabsTrigger value="sequence">Operational sequence</TabsTrigger>
          </TabsList>
          <TabsContent value="flow" className="mt-0">
            <MermaidErrorBoundary>
              <MermaidViewer source={flowSource} title="System flow diagram" />
            </MermaidErrorBoundary>
          </TabsContent>
          <TabsContent value="sequence" className="mt-0">
            <MermaidErrorBoundary>
              <MermaidViewer source={sequenceSource} title="Operational sequence diagram" />
            </MermaidErrorBoundary>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
