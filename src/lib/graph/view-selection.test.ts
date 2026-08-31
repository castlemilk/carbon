import { describe, it, expect } from 'vitest'

import {
  type DetailViewState,
  type DetailRenderView,
  type DetailClientFailure,
  selectDetailView,
  selectOverviewView,
  selectPerViewFallback,
} from './view-selection'

const baseGraph = { kind: 'process' as const, cyclePolicy: 'ACYCLIC' as const }
const opGraph = { kind: 'operational' as const, cyclePolicy: 'ACYCLIC' as const }

const flowSource = 'flowchart LR\n  A-->B'
const sequenceSource = 'sequenceDiagram\n  A->>B: hi'

describe('selectDetailView', () => {
  it('returns reactflow on both views when both graphs are valid regardless of Mermaid', () => {
    const state: DetailViewState = {
      process: { status: 'valid', dto: { nodes: [], edges: [], meta: baseGraph } },
      operational: { status: 'valid', dto: { nodes: [], edges: [], meta: opGraph } },
      flowSource,
      sequenceSource,
    }
    expect(selectDetailView(state)).toEqual({
      systemFlow: { view: 'reactflow', graph: state.process.dto },
      operationalSequence: { view: 'reactflow', graph: state.operational.dto },
    })
  })

  it('returns reactflow + mermaid when process is valid and operational is missing but sequence Mermaid is present', () => {
    const state: DetailViewState = {
      process: { status: 'valid', dto: { nodes: [], edges: [], meta: baseGraph } },
      operational: { status: 'missing' },
      flowSource,
      sequenceSource,
    }
    expect(selectDetailView(state)).toEqual({
      systemFlow: { view: 'reactflow', graph: state.process.dto },
      operationalSequence: { view: 'mermaid', source: sequenceSource },
    })
  })

  it('returns mermaid + reactflow when process is missing and operational is valid and flow Mermaid is present', () => {
    const state: DetailViewState = {
      process: { status: 'missing' },
      operational: { status: 'valid', dto: { nodes: [], edges: [], meta: opGraph } },
      flowSource,
      sequenceSource,
    }
    expect(selectDetailView(state)).toEqual({
      systemFlow: { view: 'mermaid', source: flowSource },
      operationalSequence: { view: 'reactflow', graph: state.operational.dto },
    })
  })

  it('returns mermaid/mermaid when both graphs are missing but both Mermaid sources are present', () => {
    const state: DetailViewState = {
      process: { status: 'missing' },
      operational: { status: 'missing' },
      flowSource,
      sequenceSource,
    }
    expect(selectDetailView(state)).toEqual({
      systemFlow: { view: 'mermaid', source: flowSource },
      operationalSequence: { view: 'mermaid', source: sequenceSource },
    })
  })

  it('returns mermaid/content when only the flow Mermaid source is present', () => {
    const state: DetailViewState = {
      process: { status: 'missing' },
      operational: { status: 'missing' },
      flowSource,
      sequenceSource: '',
    }
    expect(selectDetailView(state)).toEqual({
      systemFlow: { view: 'mermaid', source: flowSource },
      operationalSequence: { view: 'content' },
    })
  })

  it('returns content/content when nothing is available', () => {
    const state: DetailViewState = {
      process: { status: 'missing' },
      operational: { status: 'missing' },
      flowSource: '',
      sequenceSource: '',
    }
    expect(selectDetailView(state)).toEqual({
      systemFlow: { view: 'content' },
      operationalSequence: { view: 'content' },
    })
  })

  it('treats an invalid graph the same as missing', () => {
    const state: DetailViewState = {
      process: { status: 'invalid', error: 'cycle' },
      operational: { status: 'invalid', error: 'cycle' },
      flowSource: '',
      sequenceSource: '',
    }
    expect(selectDetailView(state)).toEqual({
      systemFlow: { view: 'content' },
      operationalSequence: { view: 'content' },
    })
  })

  it('treats an absent Mermaid source the same as an empty one (no view)', () => {
    const state: DetailViewState = {
      process: { status: 'missing' },
      operational: { status: 'missing' },
      flowSource: '',
      sequenceSource: '',
    }
    expect(selectDetailView(state).operationalSequence).toEqual({ view: 'content' })
    expect(selectDetailView(state).systemFlow).toEqual({ view: 'content' })
  })
})

describe('selectDetailView with client failures', () => {
  it('falls back from a failed reactflow view to Mermaid when Mermaid is present', () => {
    const choice: DetailRenderView = selectPerViewFallback(
      { view: 'reactflow', graph: { nodes: [], edges: [], meta: baseGraph } },
      'process',
      'failed',
      flowSource,
    )
    expect(choice).toEqual({ view: 'mermaid', source: flowSource })
  })

  it('falls back from a failed reactflow view to content when Mermaid is also unavailable', () => {
    const choice: DetailRenderView = selectPerViewFallback(
      { view: 'reactflow', graph: { nodes: [], edges: [], meta: baseGraph } },
      'process',
      'failed',
      '',
    )
    expect(choice).toEqual({ view: 'content' })
  })

  it('falls back from a failed Mermaid view to content', () => {
    const choice: DetailRenderView = selectPerViewFallback(
      { view: 'mermaid', source: flowSource },
      'process',
      'failed',
      '',
    )
    expect(choice).toEqual({ view: 'content' })
  })

  it('falls back from a failed content view to content (terminal)', () => {
    const choice: DetailRenderView = selectPerViewFallback(
      { view: 'content' },
      'process',
      'failed',
      flowSource,
    )
    expect(choice).toEqual({ view: 'content' })
  })

  it('passes through a healthy view unchanged', () => {
    const choice: DetailRenderView = selectPerViewFallback(
      { view: 'reactflow', graph: { nodes: [], edges: [], meta: baseGraph } },
      'process',
      'healthy',
      flowSource,
    )
    expect(choice).toEqual({
      view: 'reactflow',
      graph: { nodes: [], edges: [], meta: baseGraph },
    })
  })

  it('applies per-view failures independently (one failed view does not take down the other)', () => {
    const state: DetailViewState = {
      process: { status: 'valid', dto: { nodes: [], edges: [], meta: baseGraph } },
      operational: { status: 'valid', dto: { nodes: [], edges: [], meta: opGraph } },
      flowSource,
      sequenceSource,
    }
    const failures: DetailClientFailure = { process: 'failed' }
    const result = selectDetailView(state, failures)
    expect(result.systemFlow).toEqual({ view: 'mermaid', source: flowSource })
    expect(result.operationalSequence).toEqual({
      view: 'reactflow',
      graph: state.operational.dto,
    })
  })

  it('applies failures independently even when Mermaid is missing for the failed side', () => {
    const state: DetailViewState = {
      process: { status: 'valid', dto: { nodes: [], edges: [], meta: baseGraph } },
      operational: { status: 'valid', dto: { nodes: [], edges: [], meta: opGraph } },
      flowSource: '',
      sequenceSource: '',
    }
    const failures: DetailClientFailure = { process: 'failed', operational: 'failed' }
    const result = selectDetailView(state, failures)
    expect(result.systemFlow).toEqual({ view: 'content' })
    expect(result.operationalSequence).toEqual({ view: 'content' })
  })
})

describe('selectOverviewView', () => {
  it('returns reactflow when the landscape graph is valid', () => {
    const dto: import('@/components/graph/graph-types').LandscapeDto = {
      nodes: [],
      edges: [],
      meta: { xKey: 'cost', yKey: 'trl', logX: false, w: 800, h: 600 },
      unmapped: [],
    }
    expect(selectOverviewView({ status: 'valid', dto })).toEqual({ view: 'reactflow', graph: dto })
  })

  it('returns scatter when the landscape graph is missing', () => {
    expect(selectOverviewView({ status: 'missing' })).toEqual({ view: 'scatter' })
  })

  it('returns scatter when the landscape graph is invalid (no Mermaid fallback)', () => {
    expect(selectOverviewView({ status: 'invalid', error: 'cycle' })).toEqual({ view: 'scatter' })
  })

  it('returns scatter when the reactflow view fails to render (overview has no Mermaid fallback)', () => {
    const dto: import('@/components/graph/graph-types').LandscapeDto = {
      nodes: [],
      edges: [],
      meta: { xKey: 'cost', yKey: 'trl', logX: false, w: 800, h: 600 },
      unmapped: [],
    }
    expect(selectOverviewView({ status: 'valid', dto }, 'failed')).toEqual({ view: 'scatter' })
  })
})
