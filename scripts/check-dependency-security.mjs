#!/usr/bin/env node
// Behavioral regressions for the patched transitive dependencies. No network or app DB.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer'

const require = createRequire(import.meta.url)

export async function checkDependencySecurity(purifyPath = path.join(path.dirname(require.resolve('dompurify')), 'purify.js')) {
  const proxyaddr = require('proxy-addr')
  // GHSA-jqcg-44mw-7w3h: IPv6 prefixes must not accidentally trust every IPv4 peer.
  assert.equal(proxyaddr.compile('::ffff:10.0.0.0/8')('203.0.113.23'), false)
  assert.equal(proxyaddr.compile('::/1')('203.0.113.23'), false)
  const trust = proxyaddr.compile('10.0.0.0/8')
  assert.equal(trust('10.1.2.3'), true)
  assert.equal(trust('203.0.113.23'), false)

  // Keep Next's existing external-image guard during the framework upgrade.
  const { ImageOptimizerCache } = require('next/dist/server/image-optimizer')
  const { defaultConfig } = require('next/dist/server/config-shared')
  const params = ImageOptimizerCache.validateParams(
    { headers: { accept: 'image/webp' } },
    { url: 'https://example.invalid/test.avif', w: '640', q: '75' },
    defaultConfig,
    false,
  )
  assert.equal(params.errorMessage, '"url" parameter is not allowed')
  assert.equal(defaultConfig.images.dangerouslyAllowSVG, false)

  // Share the already-required Mermaid browser configuration in CI.
  const config = process.env.MERMAID_PUPPETEER_CONFIG
    ? JSON.parse(readFileSync(process.env.MERMAID_PUPPETEER_CONFIG, 'utf8'))
    : {}
  const browser = await puppeteer.launch({ ...config, headless: 'shell' })
  try {
    const page = await browser.newPage()
    await page.setRequestInterception(true)
    page.on('request', (request) => request.abort())
    await page.addScriptTag({ path: purifyPath })
    const result = await page.evaluate(() => {
      const host = document.createElement('div')
      const root = host.attachShadow({ mode: 'open' })
      // Harmless split expression from GHSA-cg2g-xh64-v4q7; never evaluate it.
      root.append('$', document.createElement('object'), '{carbon}')
      window.DOMPurify.sanitize(host, { IN_PLACE: true, SAFE_FOR_TEMPLATES: true })
      const svg = window.DOMPurify.sanitize('<svg><text>Carbon</text><script>unused()</script></svg>')
      return { shadowText: host.shadowRoot.textContent, svg }
    })
    assert.equal(result.shadowText.includes('$' + '{carbon}'), false)
    assert.match(result.svg, /<text>Carbon<\/text>/)
    assert.doesNotMatch(result.svg, /<script/i)
  } finally {
    await browser.close()
  }
  console.log('dependency security: proxy trust, image guard and DOM sanitization passed')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await checkDependencySecurity()
}
