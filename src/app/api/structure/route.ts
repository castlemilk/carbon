import { fetchStructureCif, parseStructureRequest } from '@/lib/edges/structure'

export const dynamic = 'force-dynamic'

// GET /api/structure?uniprot=X OR ?pdb=Y → mmCIF text from AlphaFold DB / RCSB
export async function GET(request: Request): Promise<Response> {
  const req = parseStructureRequest(new URL(request.url).searchParams)
  if (!req) {
    return Response.json(
      { error: "expected ?uniprot=<id> or ?pdb=<id> matching /^[A-Z0-9]{4,10}$/i" },
      { status: 400 },
    )
  }
  return fetchStructureCif(req)
}
