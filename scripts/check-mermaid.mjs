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
const pathwayFiles = fs.readdirSync(DIR).filter((x) => x.endsWith('.yaml')).sort()
const EXPECTED_PATHWAY_COUNT = 24

let pass = 0
const fails = []
const expectedSources = []
if (pathwayFiles.length !== EXPECTED_PATHWAY_COUNT) {
  fails.push({ file: 'pathways', err: `expected ${EXPECTED_PATHWAY_COUNT} pathway files, found ${pathwayFiles.length}` })
}
for (const f of pathwayFiles) {
  expectedSources.push(`pathways/${f}:flow`, `pathways/${f}:sequence`)
}
const seen = new Set()
for (const f of pathwayFiles) {
  const doc = parse(fs.readFileSync(path.join(DIR, f), 'utf8'))
  for (const [kind, src] of [['flow', doc?.mermaid_source], ['sequence', doc?.mermaid_sequence_source]]) {
    const tag = `pathways/${f}:${kind}`
    if (!src) {
      fails.push({ file: tag, err: 'missing mermaid source (every pathway must declare both mermaid_source and mermaid_sequence_source)' })
      continue
    }
    seen.add(tag)
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
for (const tag of expectedSources) {
  if (!seen.has(tag)) fails.push({ file: tag, err: 'expected source not found in scan (pathway file disappeared mid-run?)' })
}
rmSync(work, { recursive: true, force: true })
console.log(`mermaid: ${pass} ok, ${fails.length} failed`)
for (const { file, err } of fails) console.error(`--- ${file}\n${err}`)
process.exit(fails.length ? 1 : 0)
