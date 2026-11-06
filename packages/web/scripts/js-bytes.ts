import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { Array } from 'effect'

// usage: bun scripts/js-bytes.ts [dist=packages/web/dist/client] [pages...]
// Gzipped JS each prerendered page loads up front (modulepreload + module scripts). Independent of CPU load, unlike Lighthouse.

const [dist = 'packages/web/dist/client', ...rest] = process.argv.slice(2)
const pages = Array.isReadonlyArrayNonEmpty(rest)
  ? rest
  : [
      'en.html',
      'en/blog.html',
      'en/blog/advanced-pothos-pruning-techniques.html',
      'en/about.html',
    ]

const gz = (file: string) =>
  gzipSync(readFileSync(file), { level: 9 }).byteLength

for (const page of pages) {
  const file = join(dist, page)
  if (!existsSync(file)) {
    console.log(`${page.padEnd(52)} missing`)
    continue
  }
  const chunks = Array.dedupe(
    Array.map(
      Array.fromIterable(
        readFileSync(file, 'utf8').matchAll(
          /(?:src|href)="\/(assets\/[^"]+\.js)"/g
        )
      ),
      (m) => m[1] ?? ''
    )
  )
  const js = Array.reduce(chunks, 0, (sum, c) => sum + gz(join(dist, c)))
  console.log(
    `${page.padEnd(52)} chunks=${chunks.length} js_gz=${js} html_gz=${gz(file)}`
  )
}
