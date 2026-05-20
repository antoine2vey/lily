import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAllPosts } from '../src/lib/posts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(__dirname, '..')
const outDir = path.join(webRoot, 'public')

const locales = ['en', 'fr'] as const

fs.mkdirSync(outDir, { recursive: true })

for (const locale of locales) {
  const posts = getAllPosts(locale)
  const outPath = path.join(outDir, `search-index-${locale}.json`)
  fs.writeFileSync(outPath, JSON.stringify(posts))
  console.log(
    `[build-search-index] wrote ${posts.length} entries → ${path.relative(webRoot, outPath)}`
  )
}
