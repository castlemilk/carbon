'use client'

import { memo } from 'react'
import { getStraightPath } from '@xyflow/react'

import type { GraphEdgeDto } from '@/components/graph/graph-types'

export interface EdgeData extends Record<string, unknown> {
  edgeKind: string
  label?: string
  sourceRefs?: string[]
}

export interface GraphEdgeProps {
  edge: GraphEdgeDto
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  selected: boolean
  emphasised: boolean
  isSelfTransition: boolean
}

const EDGE_KIND_STROKE: Record<string, string> = {
  FLOW: 'var(--color-fg)',
  FEEDBACK: 'var(--color-muted)',
  MESSAGE: 'var(--color-muted)',
  SELF_TRANSITION: 'var(--color-muted)',
  RELATION: 'var(--color-muted)',
}

const EdgeShell = ({
  edge,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
  emphasised,
  isSelfTransition,
}: GraphEdgeProps) => {
  const data = (edge.data ?? {}) as EdgeData
  const edgeKind = data.edgeKind ?? 'FLOW'
  const stroke = EDGE_KIND_STROKE[edgeKind] ?? 'var(--color-fg)'
  const strokeWidth = selected ? 2 : emphasised ? 1.5 : 1
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const shouldAnimate = edgeKind === 'FLOW' && (selected || emphasised) && !reduceMotion

  const pathProps = {
    stroke,
    strokeWidth,
    fill: 'none',
    opacity: emphasised || selected ? 1 : 0.5,
    'data-edge-kind': edgeKind,
    'data-testid': 'graph-edge',
    'data-edge-id': edge.id,
  } as const
  const markerEnd = `url(#graph-arrow-${edgeKind.toLowerCase()})`

  if (isSelfTransition) {
    const selfPath = `M ${sourceX},${sourceY} C ${sourceX + 18},${sourceY - 22} ${targetX + 60},${targetY - 22} ${targetX + 78},${targetY}`
    return (
      <g {...pathProps}>
        <path
          d={selfPath}
          markerEnd={markerEnd}
          strokeDasharray={edgeKind === 'SELF_TRANSITION' ? '4 4' : undefined}
        >
          {shouldAnimate ? (
            <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.2s" repeatCount="indefinite" />
          ) : null}
        </path>
      </g>
    )
  }

  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  })

  return (
    <g {...pathProps}>
      <path
        d={edgePath}
        markerEnd={markerEnd}
        strokeDasharray={edgeKind === 'FEEDBACK' ? '6 4' : undefined}
      >
        {shouldAnimate ? (
          <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.2s" repeatCount="indefinite" />
        ) : null}
      </path>
      {data.label ? (
        <text x={labelX} y={labelY - 6} fontSize={10} fill="var(--color-muted)" textAnchor="middle">
          {data.label}
        </text>
      ) : null}
    </g>
  )
}

export default memo(EdgeShell, (prev, next) => {
  return (
    prev.edge === next.edge &&
    prev.selected === next.selected &&
    prev.emphasised === next.emphasised &&
    prev.isSelfTransition === next.isSelfTransition
  )
})
