import Link from 'next/link'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { UNIT_ALLOWLIST } from '@/lib/seed/loader'

const BENCHMARKS: { id: string; name: string; role: string }[] = [
  {
    id: 'mea-scrubbing',
    name: 'MEA amine scrubbing',
    role: 'The incumbent point-source baseline — decades of operating data anchor cost and energy ranges for every solvent-based capture pathway.',
  },
  {
    id: 'calcium-looping',
    name: 'Calcium looping',
    role: 'Mature high-temperature solid-sorbent cycle that calibrates the energy-penalty end of the sorbent family.',
  },
  {
    id: 'beccs',
    name: 'BECCS',
    role: 'The most deployed biological removal route with storage; anchors permanence and capacity claims for the biological setting.',
  },
]

export const metadata = { title: 'About' }

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">About &amp; methodology</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          What this platform is, where every number comes from, and how far to
          trust it.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>What this is</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm leading-relaxed">
          <p>
            Carbon is a research workspace for carbon-capture pathway
            evaluation. It combines two things that usually live apart: a{' '}
            <strong>curated landscape</strong> of capture pathways with cited,
            comparable metrics, and a <strong>convergence workspace</strong>{' '}
            where you shortlist, compare, eliminate, and ultimately choose
            pathways — recording your reasoning as you go.
          </p>
          <p>
            The Landscape plots pathways against axes like cost and TRL;
            Compare puts selected pathways side by side; Materials catalogues
            the sorbents, solvents, and minerals behind them; Decision Space is
            where judgement happens via the shortlist board and journal.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How metrics are sourced</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm leading-relaxed">
          <p>
            Every number in this platform is a <strong>range plus a citation</strong> —
            there are no naked point estimates. Ranges exist because published
            studies disagree: capture cost for the same pathway varies with
            plant configuration, scale, fuel mix, and financing assumptions.
            Rather than average that disagreement away, we carry it forward so
            it stays visible in plots and comparisons.
          </p>
          <p>
            Each range carries a <code>year_basis</code>: the reference year of
            the study the figure comes from (costing basis, technology status).
            It appears in every metric table so you can tell a 2011 estimate
            from a 2022 one — currency-year normalization is{' '}
            <em>not</em> applied across sources, which is one more reason
            ranges should be read as orders of magnitude early on.
          </p>
          <p>
            Metrics cannot enter the seed without a <code>source_ref</code>{' '}
            pointing at a real citation record, and citations link out to DOIs
            and primary reports.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unit allowlist</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm leading-relaxed">
          <p>
            The seed loader rejects any metric or material property whose unit
            is not on a fixed allowlist. This keeps axes commensurable across
            pathways — no mixing $/kg with $/tCO₂ on the same plot — and turns
            unit typos into loud boot errors instead of silent bad data. The
            live list below is imported directly from the seed loader, so it
            always matches what is actually enforced:
          </p>
          <ul data-testid="unit-allowlist" className="flex flex-wrap gap-1.5">
            {[...UNIT_ALLOWLIST].sort().map((unit) => (
              <li
                key={unit}
                className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs"
              >
                {unit}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Benchmark pathways</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm leading-relaxed">
          <p>
            A few mature pathways are marked with a star (★) as{' '}
            <strong>calibration anchors</strong>. They are deliberately
            well-studied technologies whose numbers rest on operating
            experience rather than projections — when an emerging pathway
            claims lower cost or energy than a benchmark, you can see that
            claim against real engineering data instead of another projection.
          </p>
          <dl className="flex flex-col gap-3">
            {BENCHMARKS.map((b) => (
              <div key={b.id} className="flex flex-col gap-0.5">
                <dt className="font-medium">
                  <Link
                    href={`/pathways/${b.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {b.name}
                  </Link>
                </dt>
                <dd className="text-muted-foreground">{b.role}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Literature search &amp; caching</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm leading-relaxed">
          <p>
            Each pathway detail page queries <strong>OpenAlex</strong> for
            recent related work. Results are cached locally with a{' '}
            <strong>7-day TTL</strong>. Within the TTL the cache is served
            directly (badge: “as of …”); past it, the cached list is returned
            immediately and refreshed in the background — stale-while-revalidate,
            so panels never block on the network (badge: “Cached · refreshing”).
            If OpenAlex is unreachable you get an explicit “Literature
            unavailable” badge with a retry button rather than a broken page.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seed data flow</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm leading-relaxed">
          <p>
            All content — pathways, materials, citations — lives as plain YAML
            under <code>data/</code>, loaded into the local database at{' '}
            <strong>dev-server boot</strong>. To change anything, edit{' '}
            <code>data/pathways/*.yaml</code>, <code>data/materials/*.yaml</code>,
            or <code>data/sources/*.yaml</code> and restart the dev server: the
            reseeding resync makes the database mirror the YAML exactly, while
            your shortlist and journal entries survive untouched.
          </p>
          <p>
            Because the seed is versioned, <strong>git diffs are the provenance
            record</strong>: any change to a number, citation, or claim shows up
            as a reviewable commit rather than a silent database edit. The
            loader validates strictly at boot (ranges ordered, units
            allowlisted, references resolved), so a malformed edit fails loudly
            instead of loading half a dataset.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Caveats</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm leading-relaxed">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Wide ranges on early-stage pathways (low TRL) reflect genuine
              uncertainty, not sloppy sourcing. Treat a $40–$900/tCO₂ spread as
              the finding, and lean on midpoints only for plotting convenience.
            </li>
            <li>
              Permanence figures here describe <strong>capture-side</strong>{' '}
              durability (how long the pathway keeps CO₂ out of the
              atmosphere). <strong>Storage-side</strong> permanence — reservoir
              integrity, leakage monitoring, land-management reversals — is a
              distinct question this dataset does not answer.
            </li>
            <li>
              Nothing here is investment advice. The platform supports
              structured technical comparison; decisions about deploying
              capital require due diligence well beyond cited literature
              ranges.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
