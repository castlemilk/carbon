// Framework-neutral serializable graph DTOs shared by the landscape adapter
// (src/lib/landscape/graph.ts), the process adapter (src/lib/graph/process.ts),
// and the React Flow surface (src/components/graph/*). Do NOT import from
// @xyflow/react in this file — keep the DTO contract pure so server-side
// adapters can hand the same payload to the client-side renderer.

export interface GraphPositionDto {
  x: number
  y: number
}

export interface GraphNodeDto {
  id: string
  type?: string
  position: GraphPositionDto
  data: Record<string, unknown>
}

export interface GraphEdgeDto {
  id: string
  source: string
  target: string
  type?: string
  data?: Record<string, unknown>
}

// Resolved summaries carried inside node.data.ids so the React Flow inspector
// can render without re-fetching anything from the server.
export interface MaterialSummaryDto {
  id: string
  name: string
  summary?: string
}

export interface SourceSummaryDto {
  id: string
  title: string
  authors: string[]
  year: number
  venue: string
  url: string
}

export interface MetricRowDto {
  key: string
  low: number
  high: number
  unit: string
  yearBasis: number
  sourceRef: string
}

// View-specific metadata. Landscape carries axis/layout; process carries
// kind+cycle policy.
export interface LandscapeMetaDto {
  xKey: string
  yKey: string
  logX: boolean
  w: number
  h: number
}

export interface ProcessMetaDto {
  kind: 'process' | 'operational'
  cyclePolicy: string
}

export interface LandscapeDto {
  nodes: GraphNodeDto[]
  edges: GraphEdgeDto[]
  // Pathway node ids routed to the "Unmapped on this view" rail because the
  // selected axes had no numeric value (or a non-positive value under logX).
  unmapped: string[]
  meta: LandscapeMetaDto
}

export interface ProcessDto {
  nodes: GraphNodeDto[]
  edges: GraphEdgeDto[]
  meta: ProcessMetaDto
}

// Lookup bag the process adapter accepts alongside the parsed ProcessGraph so
// the inspector payload is fully resolved server-side.
export interface ProcessLookups {
  materialSummaries: Record<string, MaterialSummaryDto>
  sourceSummaries: Record<string, SourceSummaryDto>
  pathwayMetrics: Record<string, MetricRowDto>
}
