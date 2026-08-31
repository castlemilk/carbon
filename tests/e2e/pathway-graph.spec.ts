/**
 * E2E for the interactive system-flow / operational-sequence graphs on the
 * pathway detail page (Task 6). Asserts the graph-first detail surface:
 * graph-only rendering, independent tabs, inline expansion without routing,
 * stable `See more` anchors, active-edge emphasis on selection, keyboard
 * pan/zoom, and bottom-sheet-safe expansion on a small viewport.
 *
 * mof-dac carries both a process_graph and an operational_graph (Task 8 corpus)
 * and no Mermaid fallback is rendered while both are valid.
 */
import { test, expect } from '@playwright/test'

const PATHWAY_ID = 'mof-dac'
const request = `/pathways/${PATHWAY_ID}`

test.describe('pathway detail graph (Task 6)', () => {
  test('renders React Flow for both views with no Mermaid when both graphs are valid', async ({ page }) => {
    await page.goto(request)

    await expect(page.getByTestId('pathway-diagrams')).toBeVisible()

    // System flow is the default tab.
    const canvas = page.getByTestId('graph-canvas')
    await expect(canvas).toBeVisible()
    await expect(canvas.locator('[data-testid="graph-node"]').first()).toBeVisible()
    await expect(page.getByTestId('mermaid-viewer')).toHaveCount(0)

    // Operational sequence is its own independent view.
    await page.getByRole('tab', { name: 'Operational sequence' }).click()
    await expect(page.getByTestId('graph-canvas')).toBeVisible()
    await expect(page.getByTestId('mermaid-viewer')).toHaveCount(0)
  })

  test('both tabs expose independent graph surfaces', async ({ page }) => {
    await page.goto(request)

    await page.getByRole('tab', { name: 'Operational sequence' }).click()
    const operational = page.getByTestId('graph-canvas')
    await expect(operational).toBeVisible()
    // Operational sequence nodes are SEQUENCE_PARTICIPANT, distinct from the
    // physical equipments rendered on the system-flow tab.
    await expect(
      operational.locator('[data-testid="graph-node"][data-node-kind="SEQUENCE_PARTICIPANT"]').first(),
    ).toBeVisible()

    await page.getByRole('tab', { name: 'System flow' }).click()
    const system = page.getByTestId('graph-canvas')
    await expect(system).toBeVisible()
    await expect(system.locator('[data-testid="graph-node"][data-node-kind="INPUT"]').first()).toBeVisible()
  })

  test('expanding a node stays inline (no route change) and restores via Escape', async ({ page }) => {
    await page.goto(request)

    const canvas = page.getByTestId('graph-canvas')
    const node = canvas.locator('[data-testid="graph-node"][data-node-id="node:air"]').first()
    await expect(node).toBeVisible()

    await node.locator('button').click()
    const inspector = page.getByTestId('graph-inspector')
    await expect(inspector).toBeVisible()
    expect(new URL(page.url()).hash).toBe('')
    expect(page.url()).toContain(request)

    await page.keyboard.press('Escape')
    await expect(node.locator('button')).toBeFocused()
    await expect(inspector).toHaveCount(0)
  })

  test('See more deep-links to a stable in-page anchor', async ({ page }) => {
    await page.goto(request)

    const canvas = page.getByTestId('graph-canvas')
    // A material-bearing node resolves its inspector to the #materials section.
    await canvas.locator('[data-testid="graph-node"][data-node-id="node:mof"] button').click()

    const seeMore = page.getByTestId('inspector-see-more')
    await expect(seeMore).toBeVisible()
    await expect(seeMore).toHaveAttribute('href', /#materials$/)

    await seeMore.click()
    await expect(page).toHaveURL(/#materials$/)
    await expect(page.locator('#materials')).toBeVisible()
  })

  test('selecting a node emphasises its connected edges', async ({ page }) => {
    await page.goto(request)

    const canvas = page.getByTestId('graph-canvas')
    const edge = canvas.locator('[data-testid="graph-edge"][data-edge-id="edge:e1"]')
    await expect(edge).toHaveAttribute('opacity', '0.5')

    await canvas.locator('[data-testid="graph-node"][data-node-id="node:air"] button').click()

    // Incoming/outgoing edges of the selected node are emphasised (`opacity: 1`).
    await expect(edge).toHaveAttribute('opacity', '1')
    const unrelated = canvas.locator('[data-testid="graph-edge"][data-edge-id="edge:e9"]')
    await expect(unrelated).toHaveAttribute('opacity', '0.5')
  })

  test('keyboard zoom operates from the focused canvas', async ({ page }) => {
    await page.goto(request)

    const canvas = page.getByTestId('graph-canvas')
    await expect(canvas).toBeVisible()

    const viewport = canvas.locator('.react-flow__viewport')
    await expect(viewport).toBeAttached()

    await canvas.focus()
    const before = await viewport.getAttribute('style')

    await canvas.press('+')
    await expect.poll(() => viewport.getAttribute('style')).not.toBe(before)

    await canvas.press('0')
    await expect.poll(() => viewport.getAttribute('style')).toContain('scale(1)')
  })

  test('uses roving node focus and directional keyboard navigation', async ({ page }) => {
    await page.goto('/pathways/amine-silica-dac')

    const canvas = page.getByTestId('graph-canvas')
    const air = canvas.locator('[data-node-id="node:air"] button')
    const ads = canvas.locator('[data-node-id="node:ads"] button')

    await expect(air).toHaveAttribute('tabindex', '0')
    await expect(ads).toHaveAttribute('tabindex', '-1')
    await air.focus()
    await air.press('ArrowRight')
    await expect(ads).toBeFocused()
    await expect(ads).toHaveAttribute('tabindex', '0')
    await expect(air).toHaveAttribute('tabindex', '-1')
  })

  test('expanded content fits a small mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(request)

    const canvas = page.getByTestId('graph-canvas')
    await expect(canvas).toBeVisible()
    // The fixed 220px sidebar overlays the left of a 390px viewport and would
    // intercept a pointer click, so activate the node via the keyboard instead.
    const node = canvas.locator('[data-testid="graph-node"]').first()
    await expect(node).toBeVisible()
    await node.locator('button').focus()
    await page.keyboard.press('Enter')

    const inspector = page.getByTestId('graph-inspector')
    await expect(inspector).toBeVisible()
    const box = await inspector.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  })
})
