#!/usr/bin/env node
/**
 * Validate every pathway's mermaid_source renders with mermaid-cli (mmdc).
 * Exit non-zero if any diagram fails to parse/render.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const ROOT = path.resolve(import.meta.dirname, '..')
const DIR = path.join(ROOT, 'data', 'pathways')
const MMDC = path.join(ROOT, 'node_modules', '.bin', 'mmdc')
const work = mkdtempSync(path.join(tmpdir(), 'mmd-check-'))

let pass = 0
const fails = []
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.yaml')).sort()) {
  const doc = parse(fs.readFileSync(path.join(DIR, f), 'utf8'))
  for (const [kind, src] of [['flow', doc?.mermaid_source], ['sequence', doc?.mermaid_sequence_source]]) {
    if (!src) continue
    const mmd = path.join(work, 'in.mmd')
    writeFileSync(mmd, src)
    let lastError
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        execFileSync(MMDC, ['-i', mmd, '-o', path.join(work, 'out.svg'), '--quiet'], { stdio: 'pipe', timeout: 60000 })
        pass++
        lastError = undefined
        break
      } catch (e) {
        lastError = e
      }
    }
    if (lastError) {
      fails.push({ file: `${f} (${kind})`, err: (lastError.stderr?.toString() ?? lastError.message).split('\n').filter(Boolean).slice(-4).join('\n') })
    }
  }
}
rmSync(work, { recursive: true, force: true })
console.log(`mermaid: ${pass} ok, ${fails.length} failed`)
for (const { file, err } of fails) console.error(`--- ${file}\n${err}`)
process.exit(fails.length ? 1 : 0)
