/**
 * E2E for the landscape overview graph (Task 7). The `/` page now renders the
 * interactive React Flow landscape when a LandscapeGraph is present (the seed
 * DB always has one), with the scatter plot retained as the server-side
 * fallback (its behaviour is covered by view-selection unit tests + the loader
 * error fallback, so this suite stays graph-first).
 *
 * Corpus facts the assertions rely on (seed data/landscape.yaml):
 *  - 24 pathway nodes, 5 setting context nodes, 10 material context nodes, 37
 *    relationship edges on default axes (cost × TRL).
 *  - 18 pathways have cost; the 6 cost-less ones land in the "Unmapped on this
 *    view" rail (OCEAN_DIC 2, MINERALIZATION 3, BIOLOGICAL 1).
 *  - Permanence is present on 7 pathways (mapped) and absent on 17 (rail).
 *  - Benchmarks: beccs, calcium-looping, mea-scrubbing. TRL ≥ 7 = 10 pathways.
 */
import { test, expect } from '@playwright/test'

const PATHWAY_NODE = '[data-node-id^="pathway:"]'

test.describe('landscape overview graph (Task 7)', () => {
  test('defaults to the graph view with the full pathway corpus, context nodes, and unmapped rail', async ({ page }) => {
    await page.goto('/')

    const canvas = page.getByTestId('graph-canvas')
    await expect(canvas).toBeVisible()
    await expect(canvas.locator(PATHWAY_NODE)).toHaveCount(24)
    await expect(canvas.locator('[data-node-id^="setting:"]')).toHaveCount(5)
    await expect(canvas.locator('[data-node-id^="material:"]')).toHaveCount(10)
    await expect(canvas.locator('[data-testid="graph-edge"]')).toHaveCount(37)
    await expect(canvas.locator('[data-node-id="material:mg2dobpdc"]')).toHaveAttribute('data-context-hidden', 'true')

    // Missing x/y pathways are surfaced on the rail (and in the table), never
    // silently dropped.
    const rail = page.getByTestId('unmapped-rail')
    await expect(rail).toBeVisible()
    await expect(page.getByTestId('unmapped-item')).toHaveCount(6)
    for (const id of [
      'aggregate-carbonation',
      'basalt-injection',
      'electrochemical-oae',
      'electrodialysis-doc',
      'macroalgae-cultivation',
      'slag-carbonation',
    ]) {
      await expect(
        page.locator(`[data-testid="unmapped-item"][data-id="${id}"]`),
      ).toBeAttached()
    }

    // The table below always renders the full filtered set (24), including the
    // unmapped pathways.
    await expect(page.getByTestId('pathway-row')).toHaveCount(24)
    await expect(page.getByText('All pathways (24)')).toBeVisible()
    await expect(page.locator('[data-testid="pathway-row"][data-id="basalt-injection"]')).toBeAttached()
  })

  test('reveals selected pathway materials without dropping their graph endpoints', async ({ page }) => {
    await page.goto('/')
    const canvas = page.getByTestId('graph-canvas')
    const material = canvas.locator('[data-node-id="material:mg2dobpdc"]')
    await expect(material).toHaveAttribute('data-context-hidden', 'true')

    await canvas.locator('[data-node-id="pathway:mof-dac"] button').click()
    await expect(material).not.toHaveAttribute('data-context-hidden', 'true')
    await expect(canvas.locator('[data-testid="graph-edge"]')).toHaveCount(37)
  })

  test('keeps hidden context out of the tab order and uses a single roving node tab stop', async ({ page }) => {
    await page.goto('/')

    const canvas = page.getByTestId('graph-canvas')
    const hidden = canvas.locator('[data-node-id="material:mg2dobpdc"] button')
    await expect(hidden).toHaveAttribute('tabindex', '-1')

    const visibleButtons = canvas.locator('[data-testid="graph-node"]:not([data-context-hidden="true"]) button')
    await expect(visibleButtons.first()).toHaveAttribute('tabindex', '0')
    await expect(canvas.locator('[data-testid="graph-node"] button[tabindex="0"]')).toHaveCount(1)

    await canvas.locator('[data-node-id="pathway:mof-dac"] button').focus()
    await canvas.locator('[data-node-id="pathway:mof-dac"] button').press('ArrowRight')
    await expect(canvas.locator('[data-testid="graph-node"] button[tabindex="0"]')).toHaveCount(1)
  })

  test('axis selectors re-plot the graph: x = permanence maps 7 and rails 17', async ({ page }) => {
    await page.goto('/')

    await page.getByTestId('axis-x').click()
    await page.getByRole('option', { name: 'Permanence (years)' }).click()

    await expect(page).toHaveURL(/x=permanence/)
    const canvas = page.getByTestId('graph-canvas')
    await expect(canvas).toBeVisible()
    // The canvas always renders every filtered pathway node; the rail absorbs
    // those without a permanence value.
    await expect(canvas.locator(PATHWAY_NODE)).toHaveCount(24)
    await expect(page.getByTestId('unmapped-item')).toHaveCount(17)

    // A permanence-bearing pathway stays mapped and clickable.
    const mapped = canvas.locator(PATHWAY_NODE).first()
    await expect(mapped.locator('button')).toBeVisible()
  })

  test('log-X toggles the URL flag without disturbing node or rail counts', async ({ page }) => {
    await page.goto('/')

    await page.getByTestId('log-x').click()

    await expect(page).toHaveURL(/logX=1/)
    const canvas = page.getByTestId('graph-canvas')
    await expect(canvas.locator(PATHWAY_NODE)).toHaveCount(24)
    await expect(page.getByTestId('unmapped-item')).toHaveCount(6)
  })

  test('the graph honours hard filters: benchmarks, TRL floor, and settings intersection', async ({ page }) => {
    // Benchmark filter: exactly the 3 seed benchmarks, nothing unmapped.
    await page.goto('/?benchmark=1')
    let canvas = page.getByTestId('graph-canvas')
    await expect(canvas.locator(PATHWAY_NODE)).toHaveCount(3)
    await expect(page.getByTestId('unmapped-item')).toHaveCount(0)
    await expect(page.getByTestId('pathway-row')).toHaveCount(3)

    // TRL floor 7: 10 pathways; basalt-injection is the only one without cost
    // so it lands on the rail rather than disappearing.
    await page.goto('/?minTrl=7')
    canvas = page.getByTestId('graph-canvas')
    await expect(canvas.locator(PATHWAY_NODE)).toHaveCount(10)
    await expect(page.getByTestId('unmapped-item')).toHaveCount(1)
    const railLink = page.locator('[data-testid="unmapped-item"][data-id="basalt-injection"]')
    await expect(railLink).toBeVisible()
    await expect(railLink).toHaveAttribute('href', /\/pathways\/basalt-injection\?back=/)
    await expect(page.locator('[data-testid="pathway-row"][data-id="basalt-injection"]')).toBeAttached()

    // Settings intersection (URL-driven, mirroring the checkbox flow): keep
    // POINT_SOURCE + DAC + OCEAN_DIC only → 15 pathways, rail drops to the 2
    // OCEAN_DIC cost-less pathways.
    await page.goto('/?settings=POINT_SOURCE,DAC,OCEAN_DIC')
    canvas = page.getByTestId('graph-canvas')
    await expect(canvas.locator(PATHWAY_NODE)).toHaveCount(15)
    await expect(page.getByTestId('unmapped-item')).toHaveCount(2)
  })

  test('selecting a pathway emphasises its relationship edges and opens the rich inspector', async ({ page }) => {
    await page.goto('/')

    const canvas = page.getByTestId('graph-canvas')
    const mof = canvas.locator('[data-testid="graph-node"][data-node-id="pathway:mof-dac"]')
    await expect(mof).toBeVisible()
    await mof.locator('button').click()

    // Incoming DAC-setting edge and outgoing Mg2(dobpdc) material edge are
    // emphasised; an unrelated edge fades.
    await expect(canvas.locator('[data-testid="graph-edge"][data-edge-id="edge:s-mof-dac"]')).toHaveAttribute('opacity', '1')
    await expect(canvas.locator('[data-testid="graph-edge"][data-edge-id="edge:m-mof-dac-mg2dobpdc"]')).toHaveAttribute('opacity', '1')
    await expect(canvas.locator('[data-testid="graph-edge"][data-edge-id="edge:s-beccs"]')).toHaveAttribute('opacity', '0.5')

    const inspector = page.getByTestId('graph-inspector')
    await expect(inspector).toBeVisible()
    await expect(inspector).toContainText('MOF-based DAC')
    await expect(inspector).toContainText('80–600 USD/tCO2')

    // Server-resolved inspector: mechanism summary, key metrics, materials,
    // evidence count, and connected concepts.
    await expect(inspector.getByTestId('inspector-metrics')).toContainText('USD/tCO2')
    await expect(inspector).toContainText('Diamine-appended Mg2(dobpdc) MOF')
    const connected = inspector.getByTestId('inspector-connected')
    await expect(connected).toBeVisible()
    await expect(connected.locator('li')).toHaveCount(2)
    await expect(connected).toContainText('Direct air capture')
  })

  test('graph selection never mutates the comparison ids passthrough', async ({ page }) => {
    await page.goto('/')

    await page.getByTestId('compare-mof-dac').click()
    await expect(page).toHaveURL(/ids=mof-dac/)

    const canvas = page.getByTestId('graph-canvas')
    await canvas.locator('[data-testid="graph-node"][data-node-id="pathway:beccs"] button').click()
    await expect(page.getByTestId('graph-inspector')).toBeVisible()

    // Selection is local graph state; ids remain exactly the URL passthrough.
    await expect(page).toHaveURL(/ids=mof-dac/)
    expect(page.url()).not.toContain('beccs')
  })

  test('See more deep-links to the pathway page while preserving the landscape query', async ({ page }) => {
    await page.goto('/?settings=DAC')

    const canvas = page.getByTestId('graph-canvas')
    await canvas.locator('[data-testid="graph-node"][data-node-id="pathway:mof-dac"] button').click()

    const seeMore = page.getByTestId('inspector-see-more')
    await expect(seeMore).toBeVisible()
    await expect(seeMore).toHaveAttribute('href', /\/pathways\/mof-dac\?back=settings%3DDAC/)

    await seeMore.click()
    await expect(page).toHaveURL(/\/pathways\/mof-dac\?back=settings%3DDAC/)

    // The back param preserves the landscape query on the way back to `/`.
    await expect(page.getByTestId('back-to-landscape')).toHaveAttribute('href', '/?settings=DAC')
  })
})
