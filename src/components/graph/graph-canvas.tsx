'use client'

import {
  Background,
  BackgroundVariant,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import GraphEdge from '@/components/graph/graph-edge'
import GraphInspector from '@/components/graph/graph-inspector'
import GraphErrorBoundary from '@/components/graph/graph-error-boundary'
import GraphNode, { type NodeShellData } from '@/components/graph/graph-node'
import type { GraphEdgeDto, GraphNodeDto } from '@/components/graph/graph-types'

interface Props {
  nodes: GraphNodeDto[]
  edges: GraphEdgeDto[]
  inspectorId?: string
  seeMoreHref?: (nodeId: string) => string | undefined
  fitPadding?: number
  onError?: () => void
}

type RFNode = Node<NodeShellData, 'default'>

const TypedGraphNode = (props: NodeProps<RFNode>) => {
  return (
    <GraphNode
      id={props.id}
      data={props.data}
      selected={!!props.selected}
    />
  )
}

const TypedGraphEdge = (props: EdgeProps) => {
  const data = (props.data ?? {}) as import('@/components/graph/graph-edge').EdgeData & {
    __emphasised?: boolean
  }
  return (
          <GraphEdge
      edge={{ id: props.id, source: props.source, target: props.target, data }}
      sourceX={props.sourceX}
      sourceY={props.sourceY}
      targetX={props.targetX}
      targetY={props.targetY}
      selected={!!props.selected}
      emphasised={data.__emphasised ?? false}
      isSelfTransition={props.source === props.target}
    />
  )
}

const nodeTypes = { default: TypedGraphNode }

const edgeTypes = { default: TypedGraphEdge }

export default function GraphCanvas({
  nodes,
  edges,
  inspectorId = 'graph-inspector',
  seeMoreHref,
  fitPadding = 0.15,
  onError,
}: Props) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner
        nodes={nodes}
        edges={edges}
        inspectorId={inspectorId}
        seeMoreHref={seeMoreHref}
        fitPadding={fitPadding}
        onError={onError}
      />
    </ReactFlowProvider>
  )
}

interface InnerProps extends Props {
  inspectorId: string
}

function GraphCanvasInner({
  nodes,
  edges,
  inspectorId,
  seeMoreHref,
  fitPadding,
  onError,
}: InnerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const hasInteractedRef = useRef(false)
  const liveRegionRef = useRef<HTMLDivElement>(null)
  const pendingFocusIdRef = useRef<string | null>(null)
  const { fitView, zoomIn, zoomOut, setViewport, getViewport } = useReactFlow<RFNode, Edge>()

  const revealedContextIds = useMemo(() => {
    const revealed = new Set<string>()
    if (!selectedId) return revealed
    for (const edge of edges) {
      if (edge.source === selectedId) revealed.add(edge.target)
      if (edge.target === selectedId) revealed.add(edge.source)
    }
    return revealed
  }, [edges, selectedId])

  const onSelect = useCallback((id: string) => {
    hasInteractedRef.current = true
    setSelectedId(id)
  }, [])

  const onNavigate = useCallback((id: string, direction: string) => {
    const current = nodes.find((node) => node.id === id)
    if (!current) return
    const candidates = nodes
      .filter(
        (node) =>
          node.id !== id &&
          (node.data.initiallyHidden !== true || revealedContextIds.has(node.id)),
      )
      .map((node) => ({
        node,
        dx: node.position.x - current.position.x,
        dy: node.position.y - current.position.y,
      }))
      .filter(({ dx, dy }) => {
        if (direction === 'ArrowRight') return dx > 0 && Math.abs(dx) >= Math.abs(dy)
        if (direction === 'ArrowLeft') return dx < 0 && Math.abs(dx) >= Math.abs(dy)
        if (direction === 'ArrowDown') return dy > 0 && Math.abs(dy) >= Math.abs(dx)
        return dy < 0 && Math.abs(dy) >= Math.abs(dx)
      })
      .sort((a, b) => (a.dx * a.dx + a.dy * a.dy) - (b.dx * b.dx + b.dy * b.dy))
    const target = candidates[0]?.node
    if (!target) return
    hasInteractedRef.current = true
    pendingFocusIdRef.current = target.id
    setSelectedId(target.id)
  }, [nodes, revealedContextIds])

  const firstFocusableId = useMemo(
    () => nodes.find((node) => node.data.initiallyHidden !== true)?.id,
    [nodes],
  )

  const fitViewNodeIds = useMemo(
    () => nodes
      .filter((node) => node.data.initiallyHidden !== true)
      .map((node) => ({ id: node.id })),
    [nodes],
  )

  const rfNodes = useMemo<RFNode[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: 'default',
        position: n.position,
        data: {
          ...(n.data as NodeShellData),
          __inspectorId: inspectorId,
          __onSelect: onSelect,
          __onNavigate: onNavigate,
           __contextHidden:
             n.data.initiallyHidden === true && !revealedContextIds.has(n.id),
           __tabIndex:
             n.data.initiallyHidden === true
               ? -1
               : selectedId === n.id || (!selectedId && firstFocusableId === n.id)
                 ? 0
                 : -1,
        },
        selected: selectedId === n.id,
        draggable: false,
        selectable: true,
        focusable: false,
      })),
    [nodes, selectedId, inspectorId, onSelect, onNavigate, revealedContextIds, firstFocusableId],
  )

  useEffect(() => {
    const pendingId = pendingFocusIdRef.current
    if (!pendingId || pendingId !== selectedId) return
    pendingFocusIdRef.current = null
    window.setTimeout(() => {
      wrapperRef.current?.querySelector<HTMLElement>(`[data-node-id="${pendingId}"] button`)?.focus()
    }, 0)
  }, [selectedId])

  const emphasisedEdgeIds = useMemo(() => {
    if (!selectedId) return new Set<string>()
    const ids = new Set<string>()
    for (const e of edges) {
      if (e.source === selectedId || e.target === selectedId) ids.add(e.id)
    }
    return ids
  }, [edges, selectedId])

  const rfEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'default',
        data: { ...e.data, __emphasised: emphasisedEdgeIds.has(e.id) },
        focusable: false,
      })),
    [edges, emphasisedEdgeIds],
  )

  const fitPaddingRef = useRef(fitPadding)
  useEffect(() => {
    fitPaddingRef.current = fitPadding
  }, [fitPadding])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    if (!hasInteractedRef.current) {
      fitView({ nodes: fitViewNodeIds, padding: fitPaddingRef.current, duration: 0 })
    }
    const observer = new ResizeObserver(() => {
      if (hasInteractedRef.current) return
      fitView({ nodes: fitViewNodeIds, padding: fitPaddingRef.current, duration: 0 })
    })
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [fitView, fitViewNodeIds])

  const handleNodeClick = useCallback(
    (_event: unknown, node: Node) => {
      onSelect(node.id)
    },
    [onSelect],
  )

  const handlePaneClick = useCallback(() => {
    setSelectedId(null)
  }, [])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        zoomIn({ duration: 150 })
        hasInteractedRef.current = true
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        zoomOut({ duration: 150 })
        hasInteractedRef.current = true
      } else if (event.key === '0') {
        event.preventDefault()
        setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 200 })
        hasInteractedRef.current = true
      } else if (event.key.startsWith('Arrow')) {
        event.preventDefault()
        const delta = event.shiftKey ? 40 : 16
        const current = getViewport()
        setViewport(
          {
            x: current.x + (event.key === 'ArrowRight' ? delta : event.key === 'ArrowLeft' ? -delta : 0),
            y: current.y + (event.key === 'ArrowDown' ? delta : event.key === 'ArrowUp' ? -delta : 0),
            zoom: current.zoom,
          },
          { duration: 0 },
        )
        hasInteractedRef.current = true
      } else if (event.key === 'Escape') {
        if (selectedId) {
          event.preventDefault()
          const trigger = wrapperRef.current?.querySelector<HTMLElement>(
            `[data-node-id="${selectedId}"] button`,
          )
          setSelectedId(null)
          trigger?.focus()
        }
      }
    },
    [selectedId, setViewport, getViewport, zoomIn, zoomOut],
  )

  const onMove = useCallback(() => {
    hasInteractedRef.current = true
  }, [])

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  )
  const seeMoreHrefForSelected =
    selectedId && seeMoreHref ? seeMoreHref(selectedId) : undefined

  const triggerSelector = useCallback(
    (id: string) => `[data-node-id="${id}"] button`,
    [],
  )

  return (
    <GraphErrorBoundary
      resetKey={`${nodes.length}:${edges.length}`}
      onError={() => onError?.()}
      fallback={(_error, reset) => (
        <div
          data-testid="graph-canvas-error"
          className="flex flex-col items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-sm"
        >
          <p>Graph could not be rendered.</p>
          <button
            type="button"
            onClick={reset}
            className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium"
          >
            Try again
          </button>
        </div>
      )}
    >
      <div
        ref={wrapperRef}
        data-testid="graph-canvas"
        tabIndex={0}
        role="application"
        aria-label="Interactive process graph. Use arrow keys to pan, plus and minus to zoom, and 0 to reset."
        onKeyDown={handleKeyDown}
        onMouseDown={() => {
          hasInteractedRef.current = true
        }}
        onWheel={() => {
          hasInteractedRef.current = true
        }}
        className="relative h-[min(560px,70vh)] min-h-[320px] w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-fg)]"
      >
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable
          disableKeyboardA11y
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          onMove={onMove}
          proOptions={{ hideAttribution: true }}
          minZoom={0.4}
          maxZoom={2.5}
          fitView
           fitViewOptions={{ padding: fitPadding, nodes: fitViewNodeIds }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />
          <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden>
            <defs>
              <marker
                id="graph-arrow-flow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-fg)" />
              </marker>
              <marker
                id="graph-arrow-feedback"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-muted)" />
              </marker>
              <marker
                id="graph-arrow-message"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-muted)" />
              </marker>
              <marker
                id="graph-arrow-self_transition"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-muted)" />
              </marker>
              <marker
                id="graph-arrow-relation"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-muted)" />
              </marker>
            </defs>
          </svg>
        </ReactFlow>
        {selectedNode ? (
          <div className="pointer-events-auto absolute right-4 top-4 z-10 w-[320px] max-w-[80%]">
            <GraphInspector
              node={selectedNode}
              inspectorId={inspectorId}
              triggerSelector={triggerSelector}
              seeMoreHref={seeMoreHrefForSelected}
              onClose={() => {
                setSelectedId(null)
              }}
            />
          </div>
        ) : null}
        <div ref={liveRegionRef} aria-live="polite" className="sr-only">
          {selectedNode
            ? `Selected ${(selectedNode.data as NodeShellData).label ?? selectedNode.id}`
            : ''}
        </div>
      </div>
    </GraphErrorBoundary>
  )
}
