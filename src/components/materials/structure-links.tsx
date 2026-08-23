interface Props {
  uniprot?: string
  pdbIds: string[]
}

// external structure links — rendered server-side so they survive any viewer failure
export default function StructureLinks({ uniprot, pdbIds }: Props) {
  return (
    <div data-testid="structure-links" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {uniprot && (
        <a
          href={`https://alphafold.ebi.ac.uk/entry/${encodeURIComponent(uniprot)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-4 hover:underline"
        >
          View at AlphaFold DB
        </a>
      )}
      {pdbIds.map((pdb) => (
        <a
          key={pdb}
          href={`https://www.rcsb.org/structure/${encodeURIComponent(pdb)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-4 hover:underline"
        >
          View at RCSB
          <span className="text-muted-foreground">{` (${pdb})`}</span>
        </a>
      ))}
    </div>
  )
}
