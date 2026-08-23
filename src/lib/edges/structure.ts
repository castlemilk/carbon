// structure-file edge: /api/structure proxies AlphaFold DB / RCSB mmCIF downloads so
// the browser viewer hits a same-origin URL and upstream ids never reach a URL unsanitized.
const STRUCTURE_ID_RE = /^[A-Z0-9]{4,10}$/i
const UPSTREAM_TIMEOUT_MS = 15_000

// AlphaFold DB rotates model versions on its file CDN; try newest first, fall back to v4
const ALPHAFOLD_MODEL_VERSIONS = ['v6', 'v4'] as const

export type StructureKind = 'uniprot' | 'pdb'

export interface StructureRequest {
  kind: StructureKind
  id: string
}

export const isValidStructureId = (id: string): boolean => STRUCTURE_ID_RE.test(id)

/** ?uniprot=X OR ?pdb=Y → normalized request; null on missing/malformed ids */
export function parseStructureRequest(sp: URLSearchParams): StructureRequest | null {
  const uniprot = (sp.get('uniprot') ?? '').trim()
  const pdb = (sp.get('pdb') ?? '').trim()
  // both present → UniProt wins (AlphaFold predicted model supersedes a single PDB chain)
  if (uniprot) {
    if (!isValidStructureId(uniprot)) return null
    return { kind: 'uniprot', id: uniprot.toUpperCase() }
  }
  if (pdb) {
    if (!isValidStructureId(pdb)) return null
    return { kind: 'pdb', id: pdb.toUpperCase() }
  }
  return null
}

export function upstreamUrls(req: StructureRequest): string[] {
  if (req.kind === 'pdb') {
    return [`https://files.rcsb.org/download/${req.id}.cif`]
  }
  return ALPHAFOLD_MODEL_VERSIONS.map(
    (v) => `https://alphafold.ebi.ac.uk/files/AF-${req.id}-F1-model_${v}.cif`,
  )
}

export async function fetchStructureCif(req: StructureRequest): Promise<Response> {
  let lastStatus = 0
  for (const url of upstreamUrls(req)) {
    let upstream: Response
    try {
      upstream = await fetch(url, {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        headers: { accept: 'text/plain, chemical/x-cif;q=0.9, */*;q=0.8' },
      })
    } catch {
      continue // timeout or network error — nothing to stream from this candidate
    }
    if (upstream.ok && upstream.body) {
      return new Response(upstream.body, {
        status: 200,
        headers: {
          'Content-Type': 'chemical/x-cif; charset=utf-8',
          'Cache-Control': 'public, max-age=2592000, immutable',
        },
      })
    }
    lastStatus = upstream.status || lastStatus
  }
  const detail = lastStatus ? `upstream returned ${lastStatus}` : 'upstream unreachable'
  return Response.json({ error: `structure lookup failed (${detail})` }, { status: 502 })
}
