/**
 * E2E for the landscape overview. The `/` page now renders the scatter plot
 * as the primary cost × TRL view, with the full filtered pathway table below.
 *
 * Corpus facts the assertions rely on (seed data):
 *  - 18 pathways have cost; the 6 cost-less ones show in the "missing x"
 *    note (OCEAN_DIC 2, MINERALIZATION 3, BIOLOGICAL 1).
 *  - Benchmarks: beccs, calcium-looping, mea-scrubbing.
 *  - On default axes (cost × TRL) the plot renders 18 dots and the missing-x
 *    note reports the 6 excluded pathways. The table below always lists all
 *    24 filtered pathways.
 */
import { test, expect } from '@playwright/test'

test.describe('landscape overview (scatter plot)', () => {
  test('defaults to the scatter plot with the full filtered set + missing-axis notes', async ({ page }) => {
    await page.goto('/')

    const svg = page.locator('svg[aria-label*="scatter plot"]')
    await expect(svg).toBeVisible()

    // Default axes (cost × TRL) plot 18 dots — the 6 cost-less pathways are
    // excluded and surfaced in the missing-x note instead.
    await expect(page.locator('[data-testid="dot"]')).toHaveCount(18)
    await expect(page.getByTestId('missing-cost')).toBeVisible()
    await expect(page.getByTestId('missing-cost')).toContainText('6 pathways')

    // The table below always renders the full filtered set (24).
    await expect(page.getByTestId('pathway-row')).toHaveCount(24)
    await expect(page.getByText('All pathways (24)')).toBeVisible()
    // Excluded pathways still appear in the table.
    await expect(
      page.locator('[data-testid="pathway-row"][data-id="basalt-injection"]'),
    ).toBeAttached()
  })

  test('clicking a dot navigates to the pathway detail with the back param', async ({ page }) => {
    await page.goto('/?settings=DAC')

    // Pick any plotted dot.
    const dot = page.locator('[data-testid="dot"]').first()
    await expect(dot).toBeVisible()
    await dot.click()

    await expect(page).toHaveURL(/\/pathways\/[a-z-]+\?back=settings%3DDAC/)
  })

  test('hovering a dot reveals the value card', async ({ page }) => {
    await page.goto('/')
    const dot = page.locator('[data-testid="dot"]').first()
    await dot.hover()
    const card = page.getByTestId('hover-card')
    await expect(card).toBeVisible()
  })

  test('axis selectors re-plot: x = permanence maps 7 and excludes 17', async ({ page }) => {
    await page.goto('/')

    await page.getByTestId('axis-x').click()
    await page.getByRole('option', { name: 'Permanence (years)' }).click()

    await expect(page).toHaveURL(/x=permanence/)
    await expect(page.locator('[data-testid="dot"]')).toHaveCount(7)
    await expect(page.getByTestId('missing-permanence')).toContainText('17 pathways')
    // The full filtered table still lists every pathway.
    await expect(page.getByTestId('pathway-row')).toHaveCount(24)
  })

  test('log-X toggles the URL flag without dropping points', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('log-x').click()

    await expect(page).toHaveURL(/logX=1/)
    await expect(page.locator('[data-testid="dot"]')).toHaveCount(18)
  })

  test('hard filters reduce the plot and the table consistently', async ({ page }) => {
    // Benchmark filter: exactly 3 benchmarks, all with cost.
    await page.goto('/?benchmark=1')
    await expect(page.locator('[data-testid="dot"]')).toHaveCount(3)
    await expect(page.getByTestId('missing-cost')).toHaveCount(0)
    await expect(page.getByTestId('pathway-row')).toHaveCount(3)

    // TRL floor 7: 10 pathways; basalt-injection has no cost and falls into
    // the missing-cost note but stays in the table.
    await page.goto('/?minTrl=7')
    await expect(page.locator('[data-testid="dot"]')).toHaveCount(9)
    await expect(page.getByTestId('missing-cost')).toContainText('1 pathway')
    await expect(
      page.locator('[data-testid="pathway-row"][data-id="basalt-injection"]'),
    ).toBeAttached()

    // Settings intersection (POINT_SOURCE + DAC + OCEAN_DIC) → 15 pathways,
    // 13 plotted, 2 OCEAN_DIC cost-less in the missing note.
    await page.goto('/?settings=POINT_SOURCE,DAC,OCEAN_DIC')
    await expect(page.locator('[data-testid="dot"]')).toHaveCount(13)
    await expect(page.getByTestId('missing-cost')).toContainText('2 pathways')
    await expect(page.getByTestId('pathway-row')).toHaveCount(15)
  })
})
