'use client'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

/** Tracks `prefers-reduced-motion: reduce` so we can fall back to an instant flip. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return reduced
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const reduced = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard next-themes deferred-mount idiom
    setMounted(true)
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const isDark = mounted && resolvedTheme === 'dark'
  const glide = ready && !reduced

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle dark mode"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={
        'group relative inline-flex h-7 w-[52px] shrink-0 cursor-pointer items-center rounded-full ' +
        'border border-[var(--color-border)] bg-[var(--color-surface-2)] px-[3px] ' +
        'shadow-[inset_0_1px_2px_rgba(0,0,0,0.18)] outline-none transition-colors ' +
        'hover:border-[var(--color-muted)] focus-visible:ring-2 focus-visible:ring-[var(--color-fg)]/45 ' +
        'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] ' +
        className
      }
    >
      <Sun aria-hidden className="pointer-events-none absolute left-[7px] size-3 text-[var(--color-muted)] opacity-55" />
      <Moon aria-hidden className="pointer-events-none absolute right-[7px] size-3 text-[var(--color-muted)] opacity-55" />

      <span
        className={
          'relative z-10 grid size-[22px] place-items-center rounded-full bg-[var(--color-fg)] ' +
          'shadow-[0_1px_3px_rgba(0,0,0,0.4)] will-change-transform group-active:scale-90 ' +
          (glide ? 'theme-thumb' : '')
        }
        style={{ transform: isDark ? 'translateX(24px)' : 'translateX(0px)' }}
      >
        <Sun
          aria-hidden
          className={'absolute size-[13px] text-[var(--color-bg)] ' + (glide ? 'theme-thumb-icon' : '')}
          style={{
            opacity: isDark ? 0 : 1,
            transform: isDark ? 'rotate(-90deg) scale(0.35)' : 'rotate(0) scale(1)',
          }}
        />
        <Moon
          aria-hidden
          className={'absolute size-[13px] text-[var(--color-bg)] ' + (glide ? 'theme-thumb-icon' : '')}
          style={{
            opacity: isDark ? 1 : 0,
            transform: isDark ? 'rotate(0) scale(1)' : 'rotate(90deg) scale(0.35)',
          }}
        />
      </span>
    </button>
  )
}
