/**
 * E2E scaffold for the shared interactive graph surface (Task 5).
 *
 * The full assertion set is wired here but intentionally passes only once
 * Tasks 6 and 7 mount the new graph surface on the pathway detail and
 * landscape overview pages. Until then the graph-specific selectors time out
 * and Playwright fails the spec — Task 6/7 owner is expected to make these
 * green by mounting GraphLoader on the appropriate page.
 *
 * The point of landing this spec now is to:
 *   1. Pin the public selectors (data-testid + accessible names) that the
 *      graph components already emit.
 *   2. Lock in keyboard/pan-zoom/selection behaviour so a Task 6/7 owner
 *      can't quietly regress them.
 *   3. Provide the harness route resolution (an existing seeded pathway
 *      with a known graph payload) without adding a public test-only route.
 *
 * SELECTORS USED:
 *   [data-testid="graph-canvas"]                — graph-canvas wrapper
 *   [data-testid="graph-node"]                  — node shell
 *   [data-testid="graph-node"] button           — node button (focusable)
 *   [data-testid="graph-inspector"]             — inspector aside
 *   [data-testid="graph-semantic-list"]         — accessible DOM alternative
 *   [data-testid="graph-asset-glyph"]           — fallback asset glyph
 *   [data-testid="inspector-see-more"]          — deep-link target
 */
import { test, expect } from '@playwright/test'

const PATHWAY_ID = 'mof-dac'

test.describe('interactive graph surface (Task 5 scaffold)', () => {
  test('pathway detail page exposes the graph canvas + semantic alternative', async ({ page }) => {
    await page.goto(`/pathways/${PATHWAY_ID}`)

    const canvas = page.getByTestId('graph-canvas')
    await expect(canvas).toBeVisible()
    await expect(canvas).toHaveAttribute('role', 'application')
    await expect(canvas).toHaveAttribute('aria-label', /arrow keys to pan/i)

    const node = canvas.locator('[data-testid="graph-node"]').first()
    await expect(node).toBeVisible()
    await expect(node.locator('button')).toHaveAttribute('aria-expanded', 'false')

    const semantic = page.getByTestId('graph-semantic-list')
    await expect(semantic).toBeAttached()
  })

  test('clicking a node expands the inspector with role/aria + see-more', async ({ page }) => {
    await page.goto(`/pathways/${PATHWAY_ID}`)

    const canvas = page.getByTestId('graph-canvas')
    const node = canvas.locator('[data-testid="graph-node"]').first()
    await expect(node).toBeVisible()

    await node.locator('button').click()

    const inspector = page.getByTestId('graph-inspector')
    await expect(inspector).toBeVisible()
    await expect(node.locator('button')).toHaveAttribute('aria-expanded', 'true')
    await expect(node.locator('button')).toHaveAttribute('aria-controls', 'graph-inspector')

    await expect(inspector.getByRole('heading', { level: 3 })).toBeFocused()

    const seeMore = inspector.getByTestId('inspector-see-more')
    if (await seeMore.isVisible()) {
      await expect(seeMore).toHaveAttribute('href', /\/pathways\//)
    }
  })

  test('keyboard pan/zoom from the canvas wrapper', async ({ page }) => {
    await page.goto(`/pathways/${PATHWAY_ID}`)

    const canvas = page.getByTestId('graph-canvas')
    await expect(canvas).toBeVisible()

    await canvas.focus()
    await canvas.press('+')
    await expect(canvas.locator('[aria-live="polite"]')).toBeVisible()
    await canvas.press('0')
  })

  test('Escape returns focus from inspector back to the node', async ({ page }) => {
    await page.goto(`/pathways/${PATHWAY_ID}`)

    const canvas = page.getByTestId('graph-canvas')
    const firstNode = canvas.locator('[data-testid="graph-node"]').first()
    await expect(firstNode).toBeVisible()
    await firstNode.locator('button').click()

    const inspector = page.getByTestId('graph-inspector')
    await expect(inspector).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(firstNode.locator('button')).toBeFocused()
  })

  test('missing asset renders the deterministic glyph fallback', async ({ page }) => {
    await page.goto(`/pathways/${PATHWAY_ID}`)

    const canvas = page.getByTestId('graph-canvas')
    await expect(canvas).toBeVisible()

    const glyph = canvas.locator('[data-testid="graph-asset-glyph"]').first()
    await expect(glyph).toBeVisible()
  })

  test('semantic alternative mirrors the canvas nodes', async ({ page }) => {
    await page.goto(`/pathways/${PATHWAY_ID}`)

    const canvas = page.getByTestId('graph-canvas')
    const semantic = page.getByTestId('graph-semantic-list')
    await expect(canvas).toBeVisible()
    await expect(semantic).toBeAttached()

    const canvasNodeCount = await canvas.locator('[data-testid="graph-node"]').count()
    const semanticRowCount = await semantic.locator('tbody tr[data-node-id]').count()
    expect(canvasNodeCount).toBe(semanticRowCount)
    expect(canvasNodeCount).toBeGreaterThan(0)
  })
})
