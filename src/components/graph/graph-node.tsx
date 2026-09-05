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

// Split a Mermaid label like 'Flue gas<br/>(coal / WtE)' into a primary line
// and (optional) secondary lines. The literal '<br/>' is never rendered.
// The first sub-line is shown under the title on the node; remaining sub
// lines are folded into a tooltip and surfaced in the inspector only, so
// the card stays compact and readable.
const splitLabel = (raw: string): { title: string; sub: string; tooltip: string } => {
  const parts = raw
    .split(/<br\s*\/?>/i)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return { title: '', sub: '', tooltip: '' }
  const [title, ...rest] = parts
  const sub = rest[0] ?? ''
  const tooltip = rest.length > 0 ? rest.join(' · ') : title
  return { title, sub, tooltip }
}

// Kind → accent token. Each kind gets a unique accent strip and pill colour
// so a node's role is identifiable at a glance.
const KIND_ACCENT: Record<string, { strip: string; pill: string; ink: string }> = {
  INPUT: { strip: 'var(--graph-kind-input-strip)', pill: 'var(--graph-kind-input-pill)', ink: 'var(--graph-kind-input-ink)' },
  CAPTURE: { strip: 'var(--graph-kind-capture-strip)', pill: 'var(--graph-kind-capture-pill)', ink: 'var(--graph-kind-capture-ink)' },
  MATERIAL: { strip: 'var(--graph-kind-material-strip)', pill: 'var(--graph-kind-material-pill)', ink: 'var(--graph-kind-material-ink)' },
  MEMBRANE: { strip: 'var(--graph-kind-membrane-strip)', pill: 'var(--graph-kind-membrane-pill)', ink: 'var(--graph-kind-membrane-ink)' },
  CONVERSION: { strip: 'var(--graph-kind-conversion-strip)', pill: 'var(--graph-kind-conversion-pill)', ink: 'var(--graph-kind-conversion-ink)' },
  ELECTROCHEMICAL: { strip: 'var(--graph-kind-electrochemical-strip)', pill: 'var(--graph-kind-electrochemical-pill)', ink: 'var(--graph-kind-electrochemical-ink)' },
  REGENERATION: { strip: 'var(--graph-kind-regeneration-strip)', pill: 'var(--graph-kind-regeneration-pill)', ink: 'var(--graph-kind-regeneration-ink)' },
  SEPARATION: { strip: 'var(--graph-kind-separation-strip)', pill: 'var(--graph-kind-separation-pill)', ink: 'var(--graph-kind-separation-ink)' },
  TRANSPORT: { strip: 'var(--graph-kind-transport-strip)', pill: 'var(--graph-kind-transport-pill)', ink: 'var(--graph-kind-transport-ink)' },
  STORAGE: { strip: 'var(--graph-kind-storage-strip)', pill: 'var(--graph-kind-storage-pill)', ink: 'var(--graph-kind-storage-ink)' },
  BIOLOGICAL: { strip: 'var(--graph-kind-biological-strip)', pill: 'var(--graph-kind-biological-pill)', ink: 'var(--graph-kind-biological-ink)' },
  WASTE: { strip: 'var(--graph-kind-waste-strip)', pill: 'var(--graph-kind-waste-pill)', ink: 'var(--graph-kind-waste-ink)' },
  SEQUENCE_PARTICIPANT: { strip: 'var(--graph-kind-participant-strip)', pill: 'var(--graph-kind-participant-pill)', ink: 'var(--graph-kind-participant-ink)' },
}

const kindAccent = (kind?: string) =>
  (kind && KIND_ACCENT[kind]) || KIND_ACCENT.CONVERSION

const NodeShell = ({ id, data, selected }: Props) => {
  const label = data.label || id
  const { title, sub, tooltip } = splitLabel(label)
  const summary = data.summary ?? ''
  const assetId = roleForNode(id, data.kind, data.assetId)
  const hasAsset = !!assetId
  const onSelect = data.__onSelect
  const inspectorId = data.__inspectorId ?? 'graph-inspector'
  const isHorizontal = data.handleLayout === 'horizontal'
  const accent = kindAccent(data.kind)

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

  // Sub-label is shown as a single clamped line; the full content lives in
  // the tooltip + inspector.
  const subText = sub

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
        aria-label={`${title}${sub ? `, ${sub}` : ''}${data.kind ? `, ${data.kind.toLowerCase()}` : ''}${
          data.stage ? `, stage ${data.stage.toLowerCase()}` : ''
        }`}
        data-selected={selected ? 'true' : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="group relative flex h-[112px] w-[220px] cursor-pointer flex-col items-stretch overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-left text-[var(--color-fg)] shadow-sm transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-fg)] hover:border-[var(--color-fg)] data-[selected=true]:border-[var(--color-fg)] data-[selected=true]:ring-2 data-[selected=true]:ring-[var(--color-fg)]"
      >
        <span
          aria-hidden="true"
          className="block h-1.5 w-full"
          style={{ background: accent.strip }}
        />
        <span className="flex flex-1 items-center gap-2 px-2.5 py-1.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md">
            {hasAsset ? (
              <GraphAsset assetId={assetId!} label={title} className="h-full w-full" />
            ) : (
              <GraphAssetGlyph assetId={id} label={title} className="h-full w-full" />
            )}
          </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              className="truncate text-[13px] font-semibold leading-tight"
              title={tooltip}
            >
              {title}
            </span>
            {subText ? (
              <span
                className="truncate text-[11px] leading-snug text-[var(--color-muted)]"
                title={tooltip}
              >
                {subText}
              </span>
            ) : null}
            {data.kind ? (
              <span
                className="mt-0.5 inline-flex w-fit items-center rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider"
                style={{ background: accent.pill, color: accent.ink }}
              >
                {data.kind.toLowerCase()}
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
