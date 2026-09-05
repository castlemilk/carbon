"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { ThemeToggle } from "@/components/theme/theme-toggle"

const NAV_ITEMS = [
  { label: "Landscape", href: "/" },
  { label: "Compare", href: "/compare" },
  { label: "Materials", href: "/materials" },
  { label: "Sources", href: "/sources" },
  { label: "Decision", href: "/decision" },
  { label: "About", href: "/about" },
] as const

export function EmbedNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const embedSuffix = searchParams.has("embed") ? "?embed=1" : ""

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
      <nav
        aria-label="Research platform"
        className="flex flex-wrap gap-1.5"
      >
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={`${item.href}${embedSuffix}`}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-full bg-[var(--color-fg)] px-3.5 py-1.5 font-mono text-xs font-medium uppercase tracking-widest text-[var(--color-bg)]"
                  : "rounded-full bg-[var(--color-surface-2)] px-3.5 py-1.5 font-mono text-xs font-medium uppercase tracking-widest text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
              }
            >
              {item.label}
            </Link>
          )
        })}
        {searchParams.has("embed") ? (
          <Link
            href={pathname}
            data-testid="exit-embed"
            aria-label="Exit embedded view"
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-1.5 font-mono text-xs font-medium uppercase tracking-widest text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"
          >
            Exit embed
          </Link>
        ) : null}
      </nav>
      <ThemeToggle />
    </div>
  )
}
