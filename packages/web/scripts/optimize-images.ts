import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const SCREENSHOTS_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '../public/screenshots'
)
const MAX_WIDTH = 576 // 2x retina for 288px display

async function optimizeImages() {
  const files = fs
    .readdirSync(SCREENSHOTS_DIR)
    .filter((f) => f.endsWith('.webp'))

  console.log(`Optimizing ${files.length} images...`)

  for (const file of files) {
    const inputPath = path.join(SCREENSHOTS_DIR, file)
    const metadata = await sharp(inputPath).metadata()

    if (metadata.width && metadata.width > MAX_WIDTH) {
      const buffer = await sharp(inputPath)
        .resize(MAX_WIDTH, null, { withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer()

      const originalSize = fs.statSync(inputPath).size
      fs.writeFileSync(inputPath, buffer)
      const newSize = buffer.length
      const saved = ((1 - newSize / originalSize) * 100).toFixed(1)
      console.log(
        `  ${file}: ${(originalSize / 1024).toFixed(0)}KB → ${(newSize / 1024).toFixed(0)}KB (-${saved}%)`
      )
    } else {
      // Still re-encode for quality optimization
      const buffer = await sharp(inputPath).webp({ quality: 82 }).toBuffer()

      const originalSize = fs.statSync(inputPath).size
      if (buffer.length < originalSize) {
        fs.writeFileSync(inputPath, buffer)
        const saved = ((1 - buffer.length / originalSize) * 100).toFixed(1)
        console.log(
          `  ${file}: ${(originalSize / 1024).toFixed(0)}KB → ${(buffer.length / 1024).toFixed(0)}KB (-${saved}%)`
        )
      } else {
        console.log(
          `  ${file}: already optimal (${(originalSize / 1024).toFixed(0)}KB)`
        )
      }
    }
  }

  console.log('Done!')
}

optimizeImages()
