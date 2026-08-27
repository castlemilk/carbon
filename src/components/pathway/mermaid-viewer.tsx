'use client'

import { useEffect, useId, useState } from 'react'
import { useTheme } from 'next-themes'

type Status = 'loading' | 'ready' | 'failed'

interface Props {
  source: string
  title: string
}

export default function MermaidViewer({ source, title }: Props) {
  const { resolvedTheme } = useTheme()
  const renderId = `mermaid-${useId().replace(/:/g, '')}`
  const [status, setStatus] = useState<Status>('loading')
  const [svg, setSvg] = useState('')

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

  return (
    <div data-testid="mermaid-viewer" data-status={status} className="w-full">
      {status === 'loading' && (
        <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted)]">
          Rendering {title.toLowerCase()}…
        </div>
      )}
      {status === 'ready' && (
        <div
          role="img"
          aria-label={title}
          className="mermaid-svg min-h-[240px] overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_65%,transparent)] p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
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
