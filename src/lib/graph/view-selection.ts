import type {
  LandscapeDto,
  ProcessDto,
  ProcessMetaDto,
} from '@/components/graph/graph-types'

export type GraphLoadStatus = 'valid' | 'missing' | 'invalid'

export interface GraphLoadState {
  status: GraphLoadStatus
  dto?: ProcessDto | LandscapeDto
  error?: string
}

export type ViewSlot = 'process' | 'operational'

export type DetailRenderView =
  | { view: 'reactflow'; graph: ProcessDto }
  | { view: 'mermaid'; source: string }
  | { view: 'content' }

export interface DetailViewState {
  process: GraphLoadState
  operational: GraphLoadState
  flowSource: string
  sequenceSource: string
}

export type DetailClientFailure = Partial<Record<ViewSlot, 'failed'>>

export interface DetailViewResolution {
  systemFlow: DetailRenderView
  operationalSequence: DetailRenderView
}

export type OverviewRenderView =
  | { view: 'reactflow'; graph: LandscapeDto }
  | { view: 'scatter' }

export type OverviewClientFailure = 'failed' | 'healthy'

const hasProcessGraph = (
  state: GraphLoadState,
): state is GraphLoadState & { dto: ProcessDto } => {
  if (state.status !== 'valid' || !state.dto) return false
  const meta = state.dto.meta as ProcessMetaDto
  return meta.kind === 'process' || meta.kind === 'operational'
}

const hasLandscapeGraph = (
  state: GraphLoadState,
): state is GraphLoadState & { dto: LandscapeDto } => {
  if (state.status !== 'valid' || !state.dto) return false
  const meta = state.dto.meta as ProcessMetaDto | { xKey: string }
  return !('kind' in meta)
}

const hasMermaid = (source: string | undefined): source is string =>
  typeof source === 'string' && source.trim().length > 0

const isHealthy = (failure: DetailClientFailure, slot: ViewSlot): boolean =>
  failure?.[slot] !== 'failed'

export function selectPerViewFallback(
  current: DetailRenderView,
  slot: ViewSlot,
  failure: 'failed' | 'healthy',
  fallbackSource: string,
): DetailRenderView {
  if (failure !== 'failed') return current
  if (current.view === 'reactflow') {
    return hasMermaid(fallbackSource) ? { view: 'mermaid', source: fallbackSource } : { view: 'content' }
  }
  if (current.view === 'mermaid') return { view: 'content' }
  return { view: 'content' }
}

export function selectDetailView(
  state: DetailViewState,
  failures: DetailClientFailure = {},
): DetailViewResolution {
  const processChoice = pickDetailView(state.process, state.flowSource)
  const operationalChoice = pickDetailView(state.operational, state.sequenceSource)
  return {
    systemFlow: selectPerViewFallback(
      processChoice,
      'process',
      isHealthy(failures, 'process') ? 'healthy' : 'failed',
      state.flowSource,
    ),
    operationalSequence: selectPerViewFallback(
      operationalChoice,
      'operational',
      isHealthy(failures, 'operational') ? 'healthy' : 'failed',
      state.sequenceSource,
    ),
  }
}

function pickDetailView(load: GraphLoadState, mermaidSource: string): DetailRenderView {
  if (hasProcessGraph(load)) return { view: 'reactflow', graph: load.dto }
  if (hasMermaid(mermaidSource)) return { view: 'mermaid', source: mermaidSource }
  return { view: 'content' }
}

export function selectOverviewView(
  state: GraphLoadState,
  failure: OverviewClientFailure = 'healthy',
): OverviewRenderView {
  if (failure === 'failed') return { view: 'scatter' }
  if (hasLandscapeGraph(state)) return { view: 'reactflow', graph: state.dto }
  return { view: 'scatter' }
}
