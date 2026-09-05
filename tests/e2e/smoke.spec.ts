/**
 * E2E smoke: the plan's convergence loop + journal persistence.
 *
 * LOCAL-STATE MUTATION: these tests write to carbon.db at the repo root
 * (a shortlist row for mof-dac, journal entries titled `e2e-smoke-journal-*`).
 * Cleanup deletes exactly those rows via better-sqlite3 in beforeAll/afterAll,
 * so repeat runs are idempotent and the board/journal are left as found.
 *
 * The persistence assertion runs a child_process `node -e` one-liner against
 * better-sqlite3 (the sqlite3 CLI is not assumed to exist).
 */
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { test, expect } from '@playwright/test'
import Database from 'better-sqlite3'

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const DB_PATH = path.join(repoRoot, 'carbon.db')
const JOURNAL_TITLE_PREFIX = 'e2e-smoke-journal-'
const ELIMINATED_PATHWAY = 'mof-dac'
const ELIMINATION_RATIONALE = 'Sorbent degradation risk too high'

function cleanMutatedRows(): void {
  const db = new Database(DB_PATH)
  db.prepare('DELETE FROM shortlist WHERE pathway_id = ?').run(ELIMINATED_PATHWAY)
  db.prepare('DELETE FROM journal_entries WHERE title LIKE ?').run(`${JOURNAL_TITLE_PREFIX}%`)
  db.close()
}

test.describe('smoke', () => {
  test.beforeAll(cleanMutatedRows)
  test.afterAll(cleanMutatedRows)

  test('landscape → filter → detail → eliminate w/ rationale → decision space', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /landscape/i })).toBeVisible()

    // Scatter-plot landscape: 18 dots plot on the cost × TRL axes; the 6
    // cost-less pathways are surfaced via the missing-cost note instead of
    // being silently dropped. The full filtered set always renders in the
    // pathway table below.
    const dots = page.locator('[data-testid="dot"]')
    const missingCost = page.getByTestId('missing-cost')
    await expect(dots).toHaveCount(18)
    await expect(missingCost).toContainText('6 pathways')
    await expect(page.getByTestId('pathway-row')).toHaveCount(24)

    // Settings checkboxes are exclusion toggles that all start checked, so
    // reaching DAC-only means unchecking the other four settings. The numbers
    // are plotted-dot counts after each uncheck (seed setting totals fixed:
    // POINT_SOURCE 7, DAC 5, OCEAN_DIC 3, MINERALIZATION 4, BIOLOGICAL 5);
    // the missing-cost note absorbs the cost-less subset of each setting.
    const dotsAfterUnchecking: ReadonlyArray<readonly [string, number, number]> = [
      ['POINT_SOURCE', 12, 6],
      ['OCEAN_DIC', 11, 4],
      ['MINERALIZATION', 8, 1],
      ['BIOLOGICAL', 5, 0],
    ]
    for (const [setting, remaining, missingRemaining] of dotsAfterUnchecking) {
      await page.getByTestId(`filter-setting-${setting}`).click()
      await expect(dots).toHaveCount(remaining)
      await expect(missingCost).toContainText(`${missingRemaining} pathway${missingRemaining === 1 ? '' : 's'}`)
    }

    // Navigate into a pathway via its scatter dot (the dot preserves the
    // landscape query as the back param).
    await page.locator('[data-testid="dot"][data-id="mof-dac"]').click()
    await expect(page).toHaveURL(/\/pathways\/mof-dac\?back=/)
    // The pathway detail page renders its own interactive React Flow diagram.
    await expect(page.getByTestId('graph-canvas')).toBeVisible()
    await expect(page.getByText(/\$80–\$600/)).toBeVisible()

    await page.getByTestId('eliminate-button').click()
    const rationaleBox = page.getByTestId('eliminate-rationale')
    await expect(rationaleBox).toBeVisible()
    await rationaleBox.fill(ELIMINATION_RATIONALE)
    await page.getByTestId('eliminate-confirm').click()
    await expect(page.getByTestId('shortlist-status-badge')).toHaveText(/Eliminated/i)

    await page.goto('/decision')
    const eliminated = page.getByTestId('column-ELIMINATED')
    await expect(eliminated.getByText(/MOF-based DAC/i)).toBeVisible()
    await expect(eliminated.getByText(ELIMINATION_RATIONALE)).toBeVisible()
  })

  test('journal entry created via UI persists to SQLite', async ({ page }) => {
    const title = `${JOURNAL_TITLE_PREFIX}${Date.now()}`

    await page.goto('/decision')
    await page.getByTestId('new-entry').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // journal-kind also tags timeline badges, so resolve the trigger inside the dialog
    await dialog.getByTestId('journal-kind').click()
    await page.getByRole('option', { name: 'Observation' }).click()
    await dialog.getByTestId('journal-title').fill(title)
    await dialog.getByTestId('journal-body').fill('Recorded by the e2e smoke suite.')
    await dialog.getByTestId('journal-create').click()

    await expect(page.getByTestId('journal-timeline').getByText(title)).toBeVisible()

    const script =
      "const db = require('better-sqlite3')(process.argv[1]); const row = db.prepare('SELECT id, kind, title FROM journal_entries WHERE title = ?').get(process.argv[2]); if (!row) { console.error('journal row missing from sqlite'); process.exit(1) } console.log(JSON.stringify(row))"
    const stdout = execSync(`node -e ${JSON.stringify(script)} ${JSON.stringify(DB_PATH)} ${JSON.stringify(title)}`, {
      cwd: repoRoot,
    })
    const row = JSON.parse(stdout.toString()) as { id: string; kind: string; title: string }
    expect(row.kind).toBe('OBSERVATION')
    expect(row.title).toBe(title)
  })

  test('pathway diagrams render the interactive graph in both views (Mermaid-only fallback is covered by view-selection unit tests)', async ({ page }) => {
    await page.goto('/pathways/mof-dac')

    await expect(page.getByTestId('pathway-diagrams')).toBeVisible()
    const canvas = page.getByTestId('graph-canvas')
    await expect(canvas).toBeVisible()
    await expect(canvas.locator('[data-testid="graph-node"]').first()).toBeVisible()

    await page.getByRole('tab', { name: 'Operational sequence' }).click()
    await expect(page.getByTestId('graph-canvas')).toBeVisible()

    const html = page.locator('html')
    const before = await html.getAttribute('class')
    await page.getByRole('switch', { name: 'Toggle dark mode' }).click()
    await expect.poll(() => html.getAttribute('class')).not.toBe(before)
  })
})
