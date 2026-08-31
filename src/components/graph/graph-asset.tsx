'use client'

import { useEffect, useState } from 'react'
import type { ImgHTMLAttributes } from 'react'

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  assetId: string
  basePath?: string
  label: string
}

const fallbackHash = (s: string): number => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export default function GraphAsset({
  assetId,
  basePath = '/graph-assets',
  label,
  alt,
  className,
  ...rest
}: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading')
  const src = `${basePath}/${assetId}.png`

  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled) setStatus('ready')
    }
    img.onerror = () => {
      if (!cancelled) setStatus('missing')
    }
    img.src = src
    return () => {
      cancelled = true
    }
  }, [src])

  if (status !== 'ready') return <GraphAssetGlyph assetId={assetId} label={alt ?? label} className={className} />

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? label}
      data-testid="graph-asset"
      data-asset-id={assetId}
      className={className}
      {...rest}
    />
  )
}

export function GraphAssetGlyph({
  assetId,
  label,
  className,
}: {
  assetId: string
  label: string
  className?: string
}) {
  const seed = fallbackHash(assetId || label)
  const hue = seed % 360
  const initials = (label || assetId)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?'
  return (
    <span
      role="img"
      aria-label={label}
      data-testid="graph-asset-glyph"
      data-asset-id={assetId}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: `linear-gradient(135deg, hsl(${hue} 35% 70%), hsl(${(hue + 40) % 360} 35% 60%))`,
        color: 'hsl(0 0% 100%)',
        fontFamily: 'var(--font-display, system-ui)',
        fontWeight: 600,
        fontSize: '0.95rem',
        letterSpacing: '0.04em',
        textShadow: '0 1px 1px rgba(0,0,0,0.25)',
        borderRadius: 'inherit',
      }}
    >
      {initials}
    </span>
  )
}
