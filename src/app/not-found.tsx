import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        Pathway or page not found
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The pathway, material, or page you requested isn&apos;t in the seed
        data — it may have been renamed or removed.
      </p>
      <Link
        href="/"
        className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted/40"
      >
        Back to Landscape
      </Link>
    </div>
  )
}
