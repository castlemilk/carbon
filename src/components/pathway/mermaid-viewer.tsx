'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import { Minus, Plus, RotateCcw } from 'lucide-react'

type Status = 'loading' | 'ready' | 'failed'

interface Props {
  source: string
  title: string
}

interface ViewState {
  scale: number
  x: number
  y: number
}

interface PointerPosition {
  x: number
  y: number
}

const MIN_SCALE = 0.5
const MAX_SCALE = 3
const SCALE_STEP = 0.1

const clampScale = (scale: number): number =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(scale * 10) / 10))

const distance = (a: PointerPosition, b: PointerPosition): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

export default function MermaidViewer({ source, title }: Props) {
  const { resolvedTheme } = useTheme()
  const renderId = `mermaid-${useId().replace(/:/g, '')}`
  const [status, setStatus] = useState<Status>('loading')
  const [svg, setSvg] = useState('')
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointersRef = useRef(new Map<number, PointerPosition>())
  const dragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null)
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    // Rendering is asynchronous and can be retriggered by the theme switch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('loading')
    setSvg('')

    const render = async () => {
      try {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: resolvedTheme === 'dark' ? 'dark' : 'base',
          themeVariables: {
            background: 'transparent',
            primaryColor: resolvedTheme === 'dark' ? '#1a1a23' : '#ffffff',
            primaryTextColor: resolvedTheme === 'dark' ? '#ececf0' : '#16161a',
            primaryBorderColor: resolvedTheme === 'dark' ? '#8a8a94' : '#c9c9d2',
            lineColor: resolvedTheme === 'dark' ? '#8a8a94' : '#5d5d68',
            fontFamily: 'Hanken Grotesk, sans-serif',
            fontSize: '14px',
          },
        })
        const result = await mermaid.render(renderId, source)
        if (cancelled) return
        setSvg(result.svg)
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('failed')
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  }, [renderId, resolvedTheme, source])

  const zoom = (direction: 1 | -1) => {
    setView((current) => ({ ...current, scale: clampScale(current.scale + direction * SCALE_STEP) }))
  }

  const resetView = () => setView({ scale: 1, x: 0, y: 0 })

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const focalX = event.clientX - (rect.left + rect.width / 2)
    const focalY = event.clientY - (rect.top + rect.height / 2)
    const direction = event.deltaY < 0 ? 1 : -1

    setView((current) => {
      const scale = clampScale(current.scale + direction * SCALE_STEP)
      const ratio = scale / current.scale
      return {
        scale,
        x: focalX - (focalX - current.x) * ratio,
        y: focalY - (focalY - current.y) * ratio,
      }
    })
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      if (a && b) pinchRef.current = { distance: distance(a, b), scale: view.scale }
      dragRef.current = null
      setPanning(false)
      return
    }
    dragRef.current = { x: event.clientX, y: event.clientY, originX: view.x, originY: view.y }
    setPanning(true)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()]
      if (!a || !b) return
      const nextDistance = distance(a, b)
      const scale = clampScale(pinchRef.current.scale * (nextDistance / pinchRef.current.distance))
      setView((current) => ({ ...current, scale }))
      return
    }

    const drag = dragRef.current
    if (!drag) return
    setView((current) => ({
      ...current,
      x: drag.originX + event.clientX - drag.x,
      y: drag.originY + event.clientY - drag.y,
    }))
  }

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (pointersRef.current.size === 1) {
      const [position] = [...pointersRef.current.values()]
      if (position) {
        dragRef.current = { x: position.x, y: position.y, originX: view.x, originY: view.y }
        setPanning(true)
      }
    } else {
      dragRef.current = null
      setPanning(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      zoom(1)
    } else if (event.key === '-') {
      event.preventDefault()
      zoom(-1)
    } else if (event.key === '0') {
      event.preventDefault()
      resetView()
    } else if (event.key.startsWith('Arrow')) {
      event.preventDefault()
      const delta = event.shiftKey ? 40 : 16
      setView((current) => ({
        ...current,
        x: current.x + (event.key === 'ArrowRight' ? delta : event.key === 'ArrowLeft' ? -delta : 0),
        y: current.y + (event.key === 'ArrowDown' ? delta : event.key === 'ArrowUp' ? -delta : 0),
      }))
    }
  }

  return (
    <div data-testid="mermaid-viewer" data-status={status} className="w-full">
      {status === 'loading' && (
        <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted)]">
          Rendering {title.toLowerCase()}…
        </div>
      )}
      {status === 'ready' && (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_65%,transparent)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2">
            <span className="text-xs text-[var(--color-muted)]">Drag to pan · scroll or pinch to zoom</span>
            <div className="flex items-center gap-1">
              <span aria-live="polite" className="mr-1 min-w-[3.5rem] text-right font-mono text-xs text-[var(--color-muted)]">
                {Math.round(view.scale * 100)}%
              </span>
              <Button type="button" variant="outline" size="icon-xs" aria-label="Zoom out" title="Zoom out" disabled={view.scale <= MIN_SCALE} onClick={() => zoom(-1)}>
                <Minus />
              </Button>
              <Button type="button" variant="outline" size="icon-xs" aria-label="Zoom in" title="Zoom in" disabled={view.scale >= MAX_SCALE} onClick={() => zoom(1)}>
                <Plus />
              </Button>
              <Button type="button" variant="outline" size="icon-xs" aria-label="Reset diagram view" title="Reset view" onClick={resetView}>
                <RotateCcw />
              </Button>
            </div>
          </div>
          <div
            ref={viewportRef}
            data-testid="mermaid-canvas"
            role="application"
            aria-label={`${title}. Use arrow keys to pan, plus and minus to zoom, and 0 to reset.`}
            tabIndex={0}
            className={`relative h-[min(560px,70vh)] min-h-[320px] overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-fg)] ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ touchAction: 'none' }}
            onWheel={handleWheel}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <div
              className="absolute left-1/2 top-6 w-max min-w-full origin-top"
              style={{ transform: `translate3d(calc(-50% + ${view.x}px), ${view.y}px, 0) scale(${view.scale})` }}
            >
              <div
                role="img"
                aria-label={title}
                className="mermaid-svg px-4 pb-8 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-none"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          </div>
        </div>
      )}
      {status === 'failed' && (
        <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-sm">
          <summary className="cursor-pointer font-medium">Diagram unavailable. View source</summary>
          <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap text-xs text-[var(--color-muted)]">{source}</pre>
        </details>
      )}
    </div>
  )
}
