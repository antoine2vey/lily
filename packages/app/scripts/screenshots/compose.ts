import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import * as path from 'node:path'
import { Data, Effect } from 'effect'
import sharp from 'sharp'
import {
  getCanvasSize,
  getCopy,
  type Locale,
  type Platform,
  type Screen,
} from './copy'

const requireFromHere = createRequire(import.meta.url)

export class ComposeError extends Data.TaggedError('ComposeError')<{
  readonly sourcePath: string
  readonly cause: unknown
}> {}

export class SourceMissingError extends Data.TaggedError('SourceMissingError')<{
  readonly sourcePath: string
}> {}

// Premium plant-app palette. Cream base + layered sage greens + a warm
// amber accent to imply sunlight. Cooler tech palettes read as SaaS
// marketing; this reads as editorial/lifestyle.
const BG_CREAM = '#F4EEE2' // ivory base, warm side of neutral
const BG_SAGE_MID = '#E2E7D6' // pale sage transition
const BG_SAGE_DEEP = '#BFCEB3' // grounded sage at bottom-right
const SUN_WARM = '#F0D9B3' // warm amber, used as off-canvas "sunlight"
const GLOW_SAGE = '#8AAB83' // moss, for the halo immediately behind the phone
const INK_FOREST = '#1D3A28' // deep forest — the "black" of this palette
const INK_SAGE = '#6B8B68' // medium sage, for subtitle & eyebrow
const EDGE_RING = 'rgba(29, 58, 40, 0.14)' // thin device edge
const SHADOW_COLOR = 'rgba(29, 58, 40, 0.28)' // forest-tinted shadow

interface FontFiles {
  regular: string
  medium: string
  semibold: string
  bold: string
}

const FONT_PATHS: FontFiles = {
  regular: requireFromHere.resolve(
    '@expo-google-fonts/space-grotesk/400Regular/SpaceGrotesk_400Regular.ttf'
  ),
  medium: requireFromHere.resolve(
    '@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf'
  ),
  semibold: requireFromHere.resolve(
    '@expo-google-fonts/space-grotesk/600SemiBold/SpaceGrotesk_600SemiBold.ttf'
  ),
  bold: requireFromHere.resolve(
    '@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf'
  ),
}

interface FontDataUrls {
  regular: string
  medium: string
  semibold: string
  bold: string
}

let cachedFonts: FontDataUrls | null = null
const loadFonts = Effect.gen(function* () {
  if (cachedFonts) return cachedFonts
  const read = (p: string) =>
    Effect.tryPromise({
      try: () => fs.readFile(p),
      catch: (cause) => new ComposeError({ sourcePath: p, cause }),
    })
  const [regular, medium, semibold, bold] = yield* Effect.all([
    read(FONT_PATHS.regular),
    read(FONT_PATHS.medium),
    read(FONT_PATHS.semibold),
    read(FONT_PATHS.bold),
  ])
  const toDataUrl = (b: Buffer) =>
    `data:font/ttf;base64,${b.toString('base64')}`
  cachedFonts = {
    regular: toDataUrl(regular),
    medium: toDataUrl(medium),
    semibold: toDataUrl(semibold),
    bold: toDataUrl(bold),
  }
  return cachedFonts
})

const escapeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

interface Layout {
  readonly width: number
  readonly height: number
  readonly eyebrowY: number
  readonly eyebrowFontSize: number
  readonly headlineY: number
  readonly headlineFontSize: number
  readonly headlineLineHeight: number
  readonly subtitleY: number
  readonly subtitleFontSize: number
  readonly phoneX: number
  readonly phoneY: number
  readonly phoneWidth: number
  readonly phoneHeight: number
  readonly phoneRadius: number
}

const layoutFor = (platform: Platform): Layout => {
  const [width, height] = getCanvasSize(platform)

  // Vertical rhythm (relative to canvas height):
  //   0.00–0.06  top breathing
  //   0.06–0.08  eyebrow line
  //   0.08–0.10  small gap
  //   0.10–0.21  headline (2 lines)
  //   0.21–0.23  small gap
  //   0.23–0.26  subtitle
  //   0.26–0.28  generous gap before phone
  //   0.28–0.93  phone zone (≈65% of canvas height)
  //   0.93–1.00  bottom breathing
  const eyebrowFontSize = Math.round(width * 0.028)
  const headlineFontSize = Math.round(width * 0.072)
  const headlineLineHeight = Math.round(headlineFontSize * 1.08)
  const subtitleFontSize = Math.round(width * 0.03)

  const eyebrowY = Math.round(height * 0.075) + eyebrowFontSize
  const headlineY =
    eyebrowY + Math.round(headlineFontSize * 0.55) + headlineFontSize
  const subtitleY =
    headlineY + headlineLineHeight + Math.round(subtitleFontSize * 2.0)

  const phoneZoneTop = subtitleY + Math.round(height * 0.035)
  const phoneZoneBottom = Math.round(height * 0.93)
  const phoneHeight = phoneZoneBottom - phoneZoneTop
  // Phone total aspect is the mockup's aspect (includes bezel). Screen
  // area inside the mockup is roughly iPhone 17 Pro Max native aspect
  // (2.167) — your source captures drop in cleanly.
  const mockupAspect = MOCKUP_H / MOCKUP_W
  const phoneWidth = Math.round(phoneHeight / mockupAspect)
  const phoneX = Math.round((width - phoneWidth) / 2)
  const phoneY = phoneZoneTop
  // phoneRadius kept for any consumer that still references it; the
  // mockup PNG has the real chassis corners baked in.
  const phoneRadius = Math.round(phoneWidth * 0.075)

  return {
    width,
    height,
    eyebrowY,
    eyebrowFontSize,
    headlineY,
    headlineFontSize,
    headlineLineHeight,
    subtitleY,
    subtitleFontSize,
    phoneX,
    phoneY,
    phoneWidth,
    phoneHeight,
    phoneRadius,
  }
}

const buildBackgroundSvg = (
  layout: Layout,
  copy: { eyebrow: string; headline: string; subtitle: string },
  fonts: FontDataUrls
): string => {
  const { width, height } = layout
  const headlineLines = copy.headline.split('\n').map(escapeXml)
  const headlineTspans = headlineLines
    .map(
      (line, i) =>
        `<tspan x="${width / 2}" dy="${i === 0 ? 0 : layout.headlineLineHeight}">${line}</tspan>`
    )
    .join('')

  // Main ambient halo — large, centered behind the phone, soft sage.
  // Position slightly above the phone's vertical center so the bottom
  // of the phone sits against progressively cooler ground color.
  const haloCx = width / 2
  const haloCy = layout.phoneY + layout.phoneHeight * 0.32
  const haloR = Math.round(layout.phoneWidth * 1.15)

  // "Sunlight" glow — warm amber, off-canvas top-right. Implies a window
  // out of frame. Low alpha, large radius — should feel atmospheric,
  // not like a spotlight.
  const sunCx = width * 1.05
  const sunCy = height * 0.05
  const sunR = Math.round(width * 0.9)

  // Secondary sage depth — bottom-left, deeper muted tone, pulls the
  // eye back toward the phone's base. Grounds the composition.
  const groundCx = width * -0.15
  const groundCy = height * 1.05
  const groundR = Math.round(width * 0.85)

  // Tiny sage dot under the subtitle — old-editorial pattern, replaces
  // a bullet or dash. Subtle but recognizable as premium typesetting.
  const dotCx = width / 2
  const dotR = Math.round(layout.subtitleFontSize * 0.18)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <style type="text/css">
      @font-face { font-family: 'SG'; src: url('${fonts.regular}') format('truetype'); font-weight: 400; }
      @font-face { font-family: 'SG'; src: url('${fonts.medium}') format('truetype'); font-weight: 500; }
      @font-face { font-family: 'SG'; src: url('${fonts.semibold}') format('truetype'); font-weight: 600; }
      @font-face { font-family: 'SG'; src: url('${fonts.bold}') format('truetype'); font-weight: 700; }
    </style>
    <!-- Base: diagonal cream → pale sage → deeper sage. Sets the
         editorial/lifestyle mood before anything else is rendered. -->
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BG_CREAM}" />
      <stop offset="55%" stop-color="${BG_SAGE_MID}" />
      <stop offset="100%" stop-color="${BG_SAGE_DEEP}" />
    </linearGradient>
    <!-- Sage halo — the main atmospheric element. Alpha tuned to be
         present but not obvious; should feel like light, not fog. -->
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${GLOW_SAGE}" stop-opacity="0.42" />
      <stop offset="55%" stop-color="${GLOW_SAGE}" stop-opacity="0.14" />
      <stop offset="100%" stop-color="${GLOW_SAGE}" stop-opacity="0" />
    </radialGradient>
    <!-- Warm amber glow — implies sunlight from a window out of frame.
         Counters the cool-green temperature of the sage halos, which
         keeps the overall mood "sunlit garden" not "fluorescent shop." -->
    <radialGradient id="sun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${SUN_WARM}" stop-opacity="0.55" />
      <stop offset="60%" stop-color="${SUN_WARM}" stop-opacity="0.12" />
      <stop offset="100%" stop-color="${SUN_WARM}" stop-opacity="0" />
    </radialGradient>
    <!-- Grounding — deeper sage at bottom-left, extends atmospheric
         depth. Keeps the phone from feeling stuck on a flat card. -->
    <radialGradient id="ground" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${BG_SAGE_DEEP}" stop-opacity="0.55" />
      <stop offset="100%" stop-color="${BG_SAGE_DEEP}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Background stack (painter's order: base → sun → halo → ground) -->
  <rect width="${width}" height="${height}" fill="url(#base)" />
  <circle cx="${sunCx}" cy="${sunCy}" r="${sunR}" fill="url(#sun)" />
  <circle cx="${haloCx}" cy="${haloCy}" r="${haloR}" fill="url(#halo)" />
  <circle cx="${groundCx}" cy="${groundCy}" r="${groundR}" fill="url(#ground)" />

  <!-- Text stack: eyebrow (tiny uppercase sage) → headline (deep forest,
       semibold) → subtitle (sage regular, italic-like softness via weight). -->
  <text
    x="${width / 2}"
    y="${layout.eyebrowY}"
    fill="${INK_SAGE}"
    font-family="SG, sans-serif"
    font-weight="500"
    font-size="${layout.eyebrowFontSize}"
    letter-spacing="5"
    text-anchor="middle"
  >${escapeXml(copy.eyebrow.toUpperCase())}</text>

  <text
    x="${width / 2}"
    y="${layout.headlineY}"
    fill="${INK_FOREST}"
    font-family="SG, sans-serif"
    font-weight="600"
    font-size="${layout.headlineFontSize}"
    letter-spacing="-1.2"
    text-anchor="middle"
  >${headlineTspans}</text>

  <!-- Small sage dot as visual pause between headline and subtitle -->
  <circle
    cx="${dotCx}"
    cy="${layout.subtitleY - Math.round(layout.subtitleFontSize * 1.3)}"
    r="${dotR}"
    fill="${INK_SAGE}"
    opacity="0.7"
  />

  <text
    x="${width / 2}"
    y="${layout.subtitleY}"
    fill="${INK_SAGE}"
    font-family="SG, sans-serif"
    font-weight="400"
    font-size="${layout.subtitleFontSize}"
    letter-spacing="0.2"
    text-anchor="middle"
  >${escapeXml(copy.subtitle)}</text>
</svg>`
}

// Pre-measured iPhone mockup PNG (from .agents skill library). These
// constants come from the skill's SKILL.md and describe where the
// screenshot sits inside the mockup.
const MOCKUP_PATH = path.resolve(
  import.meta.dirname,
  '../../../../.agents/skills/app-store-screenshots/mockup.png'
)
const MOCKUP_W = 1022
const MOCKUP_H = 2082
const MOCKUP_SCREEN_L = 52 / MOCKUP_W // 5.09%
const MOCKUP_SCREEN_T = 46 / MOCKUP_H // 2.21%
const MOCKUP_SCREEN_W = 918 / MOCKUP_W // 89.82%
const MOCKUP_SCREEN_H = 1990 / MOCKUP_H // 95.58%
const MOCKUP_SCREEN_RADIUS_PX = 126 // at native mockup resolution, scales

// Phone frame: uses the pre-measured iPhone mockup PNG from the skill
// library. Source screenshot is masked to rounded-rect and composited
// on top of the mockup at the documented screen coordinates. Shadow is
// forest-tinted and generously blurred to make the phone feel lifted.
const buildFramedPhone = (
  sourceBuffer: Buffer,
  layout: Layout
): Effect.Effect<Buffer, ComposeError> =>
  Effect.tryPromise({
    try: async () => {
      const { phoneWidth, phoneHeight } = layout
      const pad = 90

      // Resize the mockup to our target phone dimensions. Aspect ratio
      // is the mockup's native aspect (enforced in layoutFor).
      const mockup = await sharp(MOCKUP_PATH)
        .resize(phoneWidth, phoneHeight, { fit: 'fill' })
        .png()
        .toBuffer()

      // Where the screen sits inside the scaled mockup.
      const screenX = Math.round(phoneWidth * MOCKUP_SCREEN_L)
      const screenY = Math.round(phoneHeight * MOCKUP_SCREEN_T)
      const screenW = Math.round(phoneWidth * MOCKUP_SCREEN_W)
      const screenH = Math.round(phoneHeight * MOCKUP_SCREEN_H)
      // Corner radius scales linearly with mockup dimensions.
      const screenScale = phoneWidth / MOCKUP_W
      const screenRadius = Math.round(MOCKUP_SCREEN_RADIUS_PX * screenScale)

      // Source screenshot: fit to screen area with 'cover' + rounded
      // mask. `position: 'top'` keeps iOS status bar anchored at the
      // top if the aspect mismatch ever crops anything.
      const screenMask = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${screenW}" height="${screenH}">
          <rect width="${screenW}" height="${screenH}" rx="${screenRadius}" ry="${screenRadius}" fill="white" />
        </svg>`
      )

      const screenImage = await sharp(sourceBuffer)
        .resize(screenW, screenH, { fit: 'cover', position: 'top' })
        .composite([{ input: screenMask, blend: 'dest-in' }])
        .png()
        .toBuffer()

      // Mockup is the BASE layer; screen goes ON TOP at the screen
      // coordinates (same z-order as the skill's CSS implementation).
      const device = await sharp(mockup)
        .composite([{ input: screenImage, left: screenX, top: screenY }])
        .png()
        .toBuffer()

      // Drop shadow: soft, forest-tinted, slightly down-offset. The
      // shadow follows the mockup's outer rectangle shape (with an
      // approximated corner radius derived from the mockup's own
      // chassis corners — about 15% of width).
      const shadowRadius = Math.round(phoneWidth * 0.13)
      const shadow = await sharp({
        create: {
          width: phoneWidth + pad * 2,
          height: phoneHeight + pad * 2,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([
          {
            input: Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg"
                    width="${phoneWidth + pad * 2}" height="${phoneHeight + pad * 2}">
                <rect x="${pad}" y="${pad + 28}"
                      width="${phoneWidth}" height="${phoneHeight}"
                      rx="${shadowRadius}" ry="${shadowRadius}"
                      fill="${SHADOW_COLOR}" />
              </svg>`
            ),
          },
        ])
        .blur(48)
        .png()
        .toBuffer()

      return sharp(shadow)
        .composite([{ input: device, left: pad, top: pad }])
        .png()
        .toBuffer()
    },
    catch: (cause) => new ComposeError({ sourcePath: '<phone-frame>', cause }),
  })

export interface ComposeInput {
  readonly screen: Screen
  readonly locale: Locale
  readonly platform: Platform
  readonly sourcePath: string
  readonly outputPath: string
}

export const composeOne = (
  input: ComposeInput
): Effect.Effect<string, ComposeError | SourceMissingError> =>
  Effect.gen(function* () {
    const exists = yield* Effect.tryPromise({
      try: () =>
        fs.access(input.sourcePath).then(
          () => true,
          () => false
        ),
      catch: (cause) =>
        new ComposeError({ sourcePath: input.sourcePath, cause }),
    })
    if (!exists) {
      return yield* new SourceMissingError({ sourcePath: input.sourcePath })
    }

    const fonts = yield* loadFonts
    const layout = layoutFor(input.platform)
    const copy = getCopy(input.screen, input.locale)

    const backgroundSvg = buildBackgroundSvg(layout, copy, fonts)

    const sourceBuffer = yield* Effect.tryPromise({
      try: () => fs.readFile(input.sourcePath),
      catch: (cause) =>
        new ComposeError({ sourcePath: input.sourcePath, cause }),
    })

    const framed = yield* buildFramedPhone(sourceBuffer, layout)

    yield* Effect.tryPromise({
      try: () => fs.mkdir(path.dirname(input.outputPath), { recursive: true }),
      catch: (cause) =>
        new ComposeError({ sourcePath: input.outputPath, cause }),
    })

    const pad = 80
    yield* Effect.tryPromise({
      try: () =>
        sharp(Buffer.from(backgroundSvg))
          .composite([
            {
              input: framed,
              left: layout.phoneX - pad,
              top: layout.phoneY - pad,
            },
          ])
          .png({ compressionLevel: 9 })
          .toFile(input.outputPath),
      catch: (cause) =>
        new ComposeError({ sourcePath: input.outputPath, cause }),
    })

    return input.outputPath
  })
