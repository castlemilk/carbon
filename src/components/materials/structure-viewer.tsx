'use client'

import { useEffect, useState, type DetailedHTMLProps, type HTMLAttributes } from 'react'

import { Card, CardContent } from '@/components/ui/card'

interface Props {
  uniprot?: string
  pdbIds: string[]
}

declare module 'react' {
  // module augmentation requires a namespace — the only way to register a custom element
  // with React 19's JSX types
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      // <pdbe-molstar> web component (pdbe-molstar build bundle, loaded at runtime)
      'pdbe-molstar': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}

// pdbe-molstar web-component bundle (defines <pdbe-molstar>); loaded from CDN per
// the package docs — a self-contained UMD build, so no bundler/scss integration needed
const COMPONENT_SRC = 'https://cdn.jsdelivr.net/npm/pdbe-molstar@3.12.0/build/pdbe-molstar-component.js'
const LIGHT_CSS_HREF = 'https://cdn.jsdelivr.net/npm/pdbe-molstar@3.12.0/build/pdbe-molstar-light.css'
const INIT_TIMEOUT_MS = 10_000

type Status = 'loading' | 'ready' | 'failed'

let loaderPromise: Promise<void> | null = null

function loadPdbeMolstar(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (customElements.get('pdbe-molstar')) return Promise.resolve()
  loaderPromise ??= new Promise<void>((resolve, reject) => {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = LIGHT_CSS_HREF
    document.head.appendChild(css)

    const script = document.createElement('script')
    script.src = COMPONENT_SRC
    script.async = true
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () => {
      loaderPromise = null // allow retry after a transient CDN failure
      reject(new Error('pdbe-molstar script failed to load'))
    })
    document.head.appendChild(script)
  })
  return loaderPromise.then(() => customElements.whenDefined('pdbe-molstar')).then(() => undefined)
}

export default function StructureViewer({ uniprot, pdbIds }: Props) {
  const [status, setStatus] = useState<Status>('loading')

  const dataUrl = uniprot
    ? `/api/structure?uniprot=${encodeURIComponent(uniprot)}`
    : `/api/structure?pdb=${encodeURIComponent(pdbIds[0] ?? '')}`

  useEffect(() => {
    let cancelled = false
    // acceptance is graceful degradation: if init doesn't land in time, show fallback links
    const timer = window.setTimeout(() => {
      setStatus((s) => (s === 'loading' ? 'failed' : s))
    }, INIT_TIMEOUT_MS)
    loadPdbeMolstar().then(
      () => {
        if (!cancelled) {
          window.clearTimeout(timer)
          setStatus('ready')
        }
      },
      () => {
        if (!cancelled) {
          window.clearTimeout(timer)
          setStatus('failed')
        }
      },
    )
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <div data-testid="structure-viewer" className="flex flex-col gap-2">
      <div className="relative h-[480px] w-full overflow-hidden rounded-lg border bg-muted/20">
        {status === 'ready' && (
          <pdbe-molstar
            style={{ width: '100%', height: '100%' }}
            custom-data-url={dataUrl}
            custom-data-format="cif"
            hide-controls="false"
            loading-overlay="true"
            alphafold-view={uniprot ? 'true' : undefined}
          />
        )}
        {status === 'loading' && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading structure viewer…
          </div>
        )}
        {status === 'failed' && (
          <Card className="absolute inset-4 m-auto flex items-center">
            <CardContent className="text-sm text-muted-foreground" data-testid="structure-viewer-fallback">
              The interactive viewer could not be loaded (offline or blocked).
              {' '}Use the direct structure links below.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
