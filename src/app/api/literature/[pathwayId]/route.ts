import { openDb } from '@/lib/db/instance'
import { getPathway } from '@/lib/db/repos'
import { getLiterature } from '@/lib/edges/literature'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, ctx: { params: Promise<{ pathwayId: string }> }) {
  const { pathwayId } = await ctx.params
  const db = openDb()
  const pathway = getPathway(db, pathwayId)
  if (!pathway) return Response.json({ error: `unknown pathway: ${pathwayId}` }, { status: 404 })
  const literature = await getLiterature(db, pathway)
  return Response.json(literature)
}
