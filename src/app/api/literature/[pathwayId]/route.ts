import { getPathway } from '@/lib/db/repos'
import { getLiterature } from '@/lib/edges/literature'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, ctx: { params: Promise<{ pathwayId: string }> }) {
  const { pathwayId } = await ctx.params
  const pathway = await getPathway(pathwayId)
  if (!pathway) return Response.json({ error: `unknown pathway: ${pathwayId}` }, { status: 404 })
  const literature = await getLiterature(pathway)
  return Response.json(literature)
}
