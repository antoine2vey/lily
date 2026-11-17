import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Array } from 'effect'
import { en, type Messages } from '../src/i18n/en'
import { fr } from '../src/i18n/fr'

// usage: bun scripts/join-check.ts [base=http://127.0.0.1:8088]
// Drives headless Chrome over CDP against the prerendered build (`preview`), in English and in French. It fails
// when the invite view that replaces the skeleton shifts the layout, moves the top edge of the card or widens the
// page, when the skeleton is not about as tall as the plain invite preview, and when the consent banner covers the
// open button. It answers the invite preview call itself, so no run reaches the API.

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const [base = 'http://127.0.0.1:8088'] = process.argv.slice(2)

const CANOPY = 'Probe canopy'
const LONG_CANOPY =
  'The Extraordinarily Overgrown Greenhouse Of Aunt Wilhelmina'
const UNBROKEN_INVITER =
  'Maximilianalexanderfitzgeraldmontgomerywolfeschlegelstein'

type Answer =
  | { readonly status: number; readonly body: unknown }
  | 'connection refused'

interface Case {
  readonly name: string
  readonly answer: Answer
  readonly heading: (t: Messages['Join']) => string
  readonly skeletonTwin?: true
}

const CASES: ReadonlyArray<Case> = [
  {
    name: 'invite preview',
    answer: { status: 200, body: { canopyName: CANOPY, inviterName: 'Sam' } },
    heading: () => CANOPY,
    skeletonTwin: true,
  },
  {
    name: 'invite preview, two-line canopy name',
    answer: {
      status: 200,
      body: { canopyName: 'The Greenhouse Upstairs', inviterName: 'Sam' },
    },
    heading: () => 'The Greenhouse Upstairs',
  },
  {
    name: 'invite preview, unbroken inviter name',
    answer: {
      status: 200,
      body: { canopyName: CANOPY, inviterName: UNBROKEN_INVITER },
    },
    heading: () => CANOPY,
  },
  {
    name: 'invite preview, long names',
    answer: {
      status: 200,
      body: {
        canopyName: LONG_CANOPY,
        inviterName: 'Maximiliano Alexander Fitzgerald-Montgomery',
      },
    },
    heading: () => LONG_CANOPY,
  },
  {
    name: 'expired invite',
    answer: { status: 410, body: {} },
    heading: (t) => t.expiredTitle,
  },
  {
    name: 'invalid invite',
    answer: { status: 404, body: {} },
    heading: (t) => t.invalidTitle,
  },
  {
    name: 'API error',
    answer: { status: 503, body: {} },
    heading: (t) => t.unavailableTitle,
  },
  {
    name: 'API unreachable',
    answer: 'connection refused',
    heading: (t) => t.unavailableTitle,
  },
]

const LOCALES = [
  { language: 'en-US', t: en.Join },
  { language: 'fr-FR', t: fr.Join },
] as const

// On the small phone the banner takes 270 of the 640px, so the open button cannot end above it.
const VIEWPORTS = [
  { name: 'mobile', width: 412, height: 823, mobile: true, buttonFits: true },
  {
    name: 'narrow phone',
    width: 390,
    height: 844,
    mobile: true,
    buttonFits: true,
  },
  {
    name: 'small phone',
    width: 360,
    height: 640,
    mobile: true,
    buttonFits: false,
  },
  {
    name: 'desktop',
    width: 1350,
    height: 940,
    mobile: false,
    buttonFits: true,
  },
] as const

const CONSENTS = ['no stored choice', 'stored choice'] as const

interface Box {
  readonly top: number
  readonly bottom: number
  readonly height: number
}

const SKELETON_FRAMES = 10

// The skeleton draws one height for every language and width. French copy and a narrow card wrap the small text
// onto one or two more lines of 20px.
const SKELETON_SLACK = 40

const CORS = [
  { name: 'access-control-allow-origin', value: '*' },
  { name: 'access-control-allow-headers', value: 'content-type' },
  { name: 'access-control-allow-methods', value: 'POST' },
  { name: 'content-type', value: 'application/json' },
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const profile = mkdtempSync(join(tmpdir(), 'lily-join-'))
const chrome = Bun.spawn(
  [
    CHROME,
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--use-mock-keychain',
    '--password-store=basic',
    '--no-first-run',
    'about:blank',
  ],
  { stdout: 'ignore', stderr: 'ignore' }
)

const debugPort = async (): Promise<string> => {
  for (let i = 0; i < 100; i++) {
    try {
      const [port = ''] = readFileSync(
        join(profile, 'DevToolsActivePort'),
        'utf8'
      ).split('\n')
      if (port !== '') return port
    } catch {
      // Chrome has not written the file yet.
    }
    await sleep(100)
  }
  throw new Error('Chrome did not open a debugging port')
}

const port = await debugPort()
const target = (await (
  await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: 'PUT',
  })
).json()) as { webSocketDebuggerUrl: string }
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve) => socket.addEventListener('open', resolve))

let nextId = 0
const pending = new Map<number, (result: unknown) => void>()
let answer: Answer = 'connection refused'
const send = <T>(method: string, params: object = {}): Promise<T> =>
  new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, (result) => resolve(result as T))
    socket.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async <T>(expression: string): Promise<T> =>
  (
    await send<{ result: { value: T } }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
  ).result.value

const until = async (what: string, expression: string) => {
  for (let i = 0; i < 100; i++) {
    if (await evaluate<boolean>(expression)) return
    await sleep(100)
  }
  throw new Error(`timed out waiting for ${what}`)
}

const onPreview = async (requestId: string, method: string) => {
  // A shift needs an earlier frame to compare with, so the answer waits until the skeleton has painted.
  await until(
    'the skeleton to paint',
    `window.joinFrames >= ${SKELETON_FRAMES}`
  )
  if (answer === 'connection refused')
    return send('Fetch.failRequest', {
      requestId,
      errorReason: 'ConnectionRefused',
    })
  const preflight = method === 'OPTIONS'
  return send('Fetch.fulfillRequest', {
    requestId,
    responseCode: preflight ? 204 : answer.status,
    responseHeaders: CORS,
    body: preflight ? '' : btoa(JSON.stringify(answer.body)),
  })
}

socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data)) as {
    id?: number
    result?: unknown
    method?: string
    params?: { requestId?: string; request?: { method: string } }
  }
  if (message.id !== undefined) pending.get(message.id)?.(message.result)
  if (
    message.method === 'Fetch.requestPaused' &&
    message.params?.requestId &&
    message.params.request
  )
    void onPreview(message.params.requestId, message.params.request.method)
})

// Records every layout shift, and the box of the card in the first frame, while it still holds the skeleton.
const BOX = `(q=>{const e=document.querySelector(q);if(e===null)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}})`
const PROBE = `window.joinFrames=0;(function count(){window.joinFrames++;requestAnimationFrame(count)})();window.joinShifts=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.joinShifts.push(e.value)}).observe({type:'layout-shift',buffered:true});requestAnimationFrame(()=>{window.joinSkeleton=${BOX}('main > div')})`
const TWO_FRAMES = `new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))`

let failed = false
try {
  await send('Page.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Fetch.enable', {
    patterns: [{ urlPattern: '*canopy-invites/preview*' }],
  })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE })

  const { userAgent } = await send<{ userAgent: string }>('Browser.getVersion')
  await send('Page.navigate', { url: `${base}/join/abc` })
  await until('load', `document.readyState === 'complete'`)

  for (const { language, t } of LOCALES) {
    // The join page has no locale in its path, so it follows the browser language.
    await send('Emulation.setUserAgentOverride', {
      userAgent,
      acceptLanguage: language,
    })
    for (const viewport of VIEWPORTS) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
      })
      for (const consent of CONSENTS)
        for (const c of CASES) {
          const name = `${language}, ${c.name}, ${viewport.name}, ${consent}`
          answer = c.answer
          await evaluate(
            consent === 'stored choice'
              ? `localStorage.setItem('analytics-consent', 'denied:' + Date.now())`
              : `localStorage.clear()`
          )
          await send('Page.navigate', { url: `${base}/join/abc` })
          try {
            await until(
              'the invite view',
              `document.querySelector('main h1') !== null`
            )
            // The consent banner and its settings link mount after hydration, and a shift is reported with the next frame.
            await until(
              'hydration',
              `document.querySelector('.m-consent-settings') !== null`
            )
            await evaluate(TWO_FRAMES)
            await sleep(300)
            const seen = await evaluate<{
              language: string
              heading: string
              shifts: Array<number>
              skeleton: Box
              card: Box
              button: Box | null
              banner: Box | null
              pageWidth: number
            }>(
              `({language:navigator.language,heading:document.querySelector('main h1').textContent,shifts:window.joinShifts,skeleton:window.joinSkeleton,card:${BOX}('main > div'),button:${BOX}('main a[href^="lily:"]'),banner:${BOX}('.m-consent'),pageWidth:document.documentElement.scrollWidth})`
            )
            const cls = Array.reduce(seen.shifts, 0, (sum, v) => sum + v)
            const banner =
              seen.banner !== null && seen.banner.height > 0
                ? seen.banner
                : null
            const isPreview =
              c.answer !== 'connection refused' && c.answer.status === 200
            const problems = [
              seen.language === language
                ? null
                : `browser language "${seen.language}" (want "${language}")`,
              seen.heading === c.heading(t)
                ? null
                : `heading "${seen.heading}" (want "${c.heading(t)}")`,
              cls === 0 ? null : `layout shift ${cls.toFixed(4)} (want 0)`,
              seen.card.top === seen.skeleton.top
                ? null
                : `the card top moved from ${seen.skeleton.top}px to ${seen.card.top}px`,
              seen.pageWidth <= viewport.width
                ? null
                : `the page is ${seen.pageWidth}px wide in a ${viewport.width}px viewport`,
              c.skeletonTwin !== true ||
              Math.abs(seen.card.height - seen.skeleton.height) <=
                SKELETON_SLACK
                ? null
                : `the skeleton card is ${seen.skeleton.height}px tall and the invite preview ${seen.card.height}px (want within ${SKELETON_SLACK}px)`,
              !isPreview || seen.button !== null
                ? null
                : 'the invite preview has no open button',
              seen.button === null ||
              banner === null ||
              !viewport.buttonFits ||
              seen.button.bottom <= banner.top
                ? null
                : `the consent banner starts at ${banner.top}px and covers the open button, which ends at ${seen.button.bottom}px`,
            ].filter((problem) => problem !== null)
            if (problems.length > 0) failed = true
            console.log(
              `${problems.length === 0 ? 'ok  ' : 'FAIL'} ${name}\n     card top ${seen.card.top}px, height ${seen.skeleton.height}px as skeleton, ${seen.card.height}px after${seen.button !== null && banner !== null ? `, open button ends at ${seen.button.bottom}px, banner starts at ${banner.top}px` : ''}${problems.map((problem) => `\n     ${problem}`).join('')}`
            )
          } catch (error) {
            failed = true
            console.log(
              `FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`
            )
          }
        }
    }
  }
} catch (error) {
  failed = true
  console.log(`FAIL ${error instanceof Error ? error.message : String(error)}`)
} finally {
  socket.close()
  chrome.kill()
  await chrome.exited
  rmSync(profile, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
