import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { Array } from 'effect'

// usage: bun packages/web/scripts/page-bytes.ts [dist=packages/web/dist/client]
// Gzipped JS and CSS each prerendered page loads up front, checked against a budget. CI runs it from scripts/check-bundle-sizes.sh.
// Budgets sit about 1.3x above the sizes measured on 2026-11-06 (JS 197 KB, CSS 25 KB on the home page).

const JS_BUDGET = 250 * 1024
const CSS_BUDGET = 32 * 1024
const PAGES = [
  'en.html',
  'fr.html',
  'en/blog.html',
  'en/blog/advanced-pothos-pruning-techniques.html',
  'en/about.html',
  'fr/privacy.html',
  'join.html',
]

const [dist = 'packages/web/dist/client'] = process.argv.slice(2)

const gz = (file: string) =>
  gzipSync(readFileSync(file), { level: 9 }).byteLength

const assets = (html: string, ext: 'js' | 'css') =>
  Array.dedupe(
    Array.map(
      Array.fromIterable(
        html.matchAll(
          new RegExp(`(?:src|href)="/(assets/[^"]+\\.${ext})"`, 'g')
        )
      ),
      (m) => m[1] ?? ''
    )
  )

const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`

let failed = false
console.log(
  `${'Page'.padEnd(50)} ${'JS gz'.padEnd(10)} ${'CSS gz'.padEnd(10)} Status`
)
for (const page of PAGES) {
  const file = join(dist, page)
  if (!existsSync(file)) {
    console.log(
      `${page.padEnd(50)} ${'—'.padEnd(10)} ${'—'.padEnd(10)} FAIL (not built)`
    )
    failed = true
    continue
  }
  const html = readFileSync(file, 'utf8')
  const size = (ext: 'js' | 'css') =>
    Array.reduce(assets(html, ext), 0, (sum, c) => sum + gz(join(dist, c)))
  const js = size('js')
  const css = size('css')
  const ok = js <= JS_BUDGET && css <= CSS_BUDGET
  if (!ok) failed = true
  console.log(
    `${page.padEnd(50)} ${kb(js).padEnd(10)} ${kb(css).padEnd(10)} ${ok ? 'OK' : 'FAIL'}`
  )
}
console.log(
  `Budgets per page: JS ${kb(JS_BUDGET)}, CSS ${kb(CSS_BUDGET)} gzipped.`
)
if (failed) process.exit(1)
