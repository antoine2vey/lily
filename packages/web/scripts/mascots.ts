// Re-encodes the marketing mascot clips for public/mascot: one frame in
// three kept, canvas shrunk from 1.5x the largest CSS size until the lossy
// WebP fits under 300 KB.
// Usage: bun packages/web/scripts/mascots.ts <source dir> [name...]
import fs from 'node:fs'
import path from 'node:path'
import { Array } from 'effect'
import sharp from 'sharp'

const LIMIT = 300_000
const KEEP_EVERY = 3
// Largest display size in story.css, times 1.5 for high-density screens.
const SIZE: Record<string, number> = {
  celebrate: 198,
  jump: 330,
  'send-envelope': 255,
}
const SHRINK = [1, 0.85, 0.72, 0.6]
const QUALITIES = [70, 60, 50, 42]

const src = process.argv[2]
if (!src) throw new Error('usage: mascots.ts <source dir> [name...]')
const names =
  process.argv.length > 3 ? process.argv.slice(3) : Object.keys(SIZE)
const outDir = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '../public/mascot'
)
fs.mkdirSync(outDir, { recursive: true })

interface Encoded {
  readonly size: number
  readonly quality: number
  readonly bytes: Buffer
  readonly frames: number
}

const encode = async (
  input: string,
  pages: number,
  size: number,
  delay: number
): Promise<Encoded> => {
  const kept = Array.filter(
    Array.range(0, pages - 1),
    (i) => i % KEEP_EVERY === 0
  )
  const frames = await Promise.all(
    Array.map(kept, (page) =>
      sharp(input, { page, pages: 1 }).resize(size, size).png().toBuffer()
    )
  )
  let last: Encoded | undefined
  for (const quality of QUALITIES) {
    const bytes = await sharp(frames, { join: { animated: true } })
      .webp({ quality, effort: 6, loop: 0, delay })
      .toBuffer()
    last = { size, quality, bytes, frames: frames.length }
    if (bytes.length < LIMIT) return last
  }
  if (!last) throw new Error('no quality tried')
  return last
}

for (const name of names) {
  const input = path.join(src, `${name}.webp`)
  const meta = await sharp(input, { animated: true }).metadata()
  const pages = meta.pages ?? 1
  const delays = meta.delay ?? []
  const base = Math.min(SIZE[name] ?? meta.width ?? 280, meta.width ?? 280)
  const delay = Math.round(
    (Array.reduce(delays, 0, (a, d) => a + d) / Math.max(delays.length, 1)) *
      KEEP_EVERY
  )
  let chosen: Encoded | undefined
  for (const shrink of SHRINK) {
    chosen = await encode(input, pages, Math.round(base * shrink), delay)
    if (chosen.bytes.length < LIMIT) break
  }
  if (!chosen) throw new Error(`no encode for ${name}`)
  const out = path.join(outDir, `${name}.webp`)
  fs.writeFileSync(out, chosen.bytes)
  console.log(
    `${name}: ${fs.statSync(input).size} -> ${chosen.bytes.length} bytes, ${chosen.frames}/${pages} frames at ${delay}ms, ${chosen.size}px, q${chosen.quality}`
  )
}
