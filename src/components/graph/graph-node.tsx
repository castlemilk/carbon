'use client'

import { Handle, Position } from '@xyflow/react'
import { memo, useCallback } from 'react'
import type { CSSProperties } from 'react'

import GraphAsset, { GraphAssetGlyph } from '@/components/graph/graph-asset'
import { roleForNode } from '@/lib/graph/assets'

export interface NodeShellData extends Record<string, unknown> {
  label?: string
  kind?: string
  stage?: string
  summary?: string
  assetId?: string
  role?: string
  initiallyHidden?: boolean
  __contextHidden?: boolean
  __tabIndex?: number
  handleLayout?: 'horizontal'
  __inspectorId?: string
  __onSelect?: (id: string) => void
  __onNavigate?: (id: string, direction: string) => void
}

interface Props {
  id: string
  data: NodeShellData
  selected: boolean
}

const NodeShell = ({ id, data, selected }: Props) => {
  const label = data.label || id
  const summary = data.summary ?? ''
  const assetId = roleForNode(id, data.kind, data.assetId)
  const hasAsset = !!assetId
  const onSelect = data.__onSelect
  const inspectorId = data.__inspectorId ?? 'graph-inspector'
  const isHorizontal = data.handleLayout === 'horizontal'

  const handleClick = useCallback(() => {
    onSelect?.(id)
  }, [id, onSelect])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!event.key.startsWith('Arrow')) return
    event.preventDefault()
    event.stopPropagation()
    data.__onNavigate?.(id, event.key)
  }, [data, id])

  const handleStyle: CSSProperties = {
    width: 8,
    height: 8,
    background: 'var(--color-fg)',
    border: '1px solid var(--color-border)',
    borderRadius: '9999px',
  }

  return (
    <div
      className="relative"
      aria-hidden={data.__contextHidden ? true : undefined}
      data-context-hidden={data.__contextHidden ? 'true' : undefined}
      style={data.__contextHidden ? { opacity: 0, pointerEvents: 'none' } : undefined}
      data-testid="graph-node"
      data-node-id={id}
      data-node-kind={data.kind}
      data-node-stage={data.stage}
    >
      <Handle type="target" position={isHorizontal ? Position.Left : Position.Top} style={handleStyle} />
      <button
        type="button"
        tabIndex={data.__contextHidden ? -1 : data.__tabIndex ?? 0}
        aria-expanded={selected}
        aria-controls={inspectorId}
        aria-label={`${label}${data.kind ? `, ${data.kind.toLowerCase()}` : ''}${
          data.stage ? `, stage ${data.stage.toLowerCase()}` : ''
        }`}
        data-selected={selected ? 'true' : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="group relative flex h-[88px] w-[160px] cursor-pointer flex-col items-stretch overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-left text-[var(--color-fg)] shadow-sm transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-fg)] hover:border-[var(--color-fg)] data-[selected=true]:border-[var(--color-fg)] data-[selected=true]:ring-2 data-[selected=true]:ring-[var(--color-fg)]"
      >
        <span className="flex h-12 items-center justify-center bg-[var(--color-surface-2)]">
          {hasAsset ? (
            <GraphAsset assetId={assetId!} label={label} className="h-full w-full" />
          ) : (
            <GraphAssetGlyph assetId={id} label={label} className="h-full w-full" />
          )}
        </span>
        <span className="flex flex-1 flex-col justify-center gap-0.5 px-2 py-1">
          <span className="truncate text-sm font-medium" title={label}>
            {label}
          </span>
          <span className="flex items-center justify-between gap-1 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
            <span>{data.kind?.toLowerCase()}</span>
            {data.role ? (
              <span className="rounded-sm bg-[var(--color-surface-2)] px-1 py-px text-[9px] font-semibold">
                {data.role}
              </span>
            ) : null}
          </span>
        </span>
        {summary && selected ? <span className="sr-only">{summary}</span> : null}
      </button>
      <Handle type="source" position={isHorizontal ? Position.Right : Position.Bottom} style={handleStyle} />
    </div>
  )
}

export default memo(NodeShell, (prev, next) => {
  return (
    prev.id === next.id &&
    prev.selected === next.selected &&
    prev.data.label === next.data.label &&
    prev.data.kind === next.data.kind &&
    prev.data.stage === next.data.stage &&
    prev.data.assetId === next.data.assetId &&
    prev.data.role === next.data.role &&
    prev.data.summary === next.data.summary &&
    prev.data.__onSelect === next.data.__onSelect &&
    prev.data.__onNavigate === next.data.__onNavigate &&
    prev.data.__contextHidden === next.data.__contextHidden &&
    prev.data.__tabIndex === next.data.__tabIndex &&
    prev.data.handleLayout === next.data.handleLayout &&
    prev.data.__inspectorId === next.data.__inspectorId
  )
})
