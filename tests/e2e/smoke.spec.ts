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

    const dots = page.locator('[data-testid="dot"]')
    await expect(dots).toHaveCount(18)

    // Settings checkboxes are exclusion toggles that all start checked, so
    // reaching DAC-only means unchecking the other four settings; the numbers
    // are dot counts after each uncheck (seed cost/trl coverage is fixed:
    // POINT_SOURCE 7, DAC 5, OCEAN_DIC 1, MINERALIZATION 1, BIOLOGICAL 4).
    const dotsAfterUnchecking: ReadonlyArray<readonly [string, number]> = [
      ['POINT_SOURCE', 11],
      ['OCEAN_DIC', 10],
      ['MINERALIZATION', 9],
      ['BIOLOGICAL', 5],
    ]
    for (const [setting, remaining] of dotsAfterUnchecking) {
      await page.getByTestId(`filter-setting-${setting}`).click()
      await expect(dots).toHaveCount(remaining)
    }

    await page.locator('[data-testid="dot"][data-id="mof-dac"]').click()
    await expect(page).toHaveURL(/\/pathways\/mof-dac/)
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

  test('pathway diagrams render in both views and theme toggle updates the document', async ({ page }) => {
    await page.goto('/pathways/mof-dac')

    await expect(page.getByTestId('pathway-diagrams')).toBeVisible()
    await expect(page.getByTestId('mermaid-viewer').first()).toHaveAttribute('data-status', 'ready')
    await expect(page.getByTestId('mermaid-canvas').locator('svg')).toBeVisible()

    const canvas = page.getByTestId('mermaid-canvas')
    await canvas.focus()
    await canvas.press('+')
    await expect(page.getByTestId('mermaid-viewer').locator('[aria-live="polite"]')).toHaveText('110%')
    await canvas.press('0')
    await expect(page.getByTestId('mermaid-viewer').locator('[aria-live="polite"]')).toHaveText('100%')

    await page.getByRole('tab', { name: 'Operational sequence' }).click()
    await expect(page.getByTestId('mermaid-viewer').last()).toHaveAttribute('data-status', 'ready')
    await expect(page.getByTestId('mermaid-canvas').locator('svg')).toBeVisible()

    const html = page.locator('html')
    const before = await html.getAttribute('class')
    await page.getByRole('switch', { name: 'Toggle dark mode' }).click()
    await expect.poll(() => html.getAttribute('class')).not.toBe(before)
  })
})
