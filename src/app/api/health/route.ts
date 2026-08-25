import { listPathways } from '@/lib/db/repos'

export const dynamic = 'force-dynamic'

// Liveness/readiness for cluster probes: cheap, dependency-checking, no auth.
export async function GET() {
  try {
    const pathways = await listPathways()
    return Response.json({
      status: 'ok',
      components: {
        database: { status: 'healthy', pathways: pathways.length },
      },
      response_time_ms: 0,
    })
  } catch (e) {
    return Response.json(
      { status: 'unhealthy', error: (e as Error).message },
      { status: 503 },
    )
  }
}
