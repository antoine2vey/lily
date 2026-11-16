import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Array } from 'effect'
import { en, type Messages } from '../src/i18n/en'
import { fr } from '../src/i18n/fr'

// usage: bun scripts/join-check.ts [base=http://127.0.0.1:8088]
// Drives headless Chrome over CDP against the prerendered build (`preview`) and fails when the join page reports a
// layout shift while the invite view replaces the skeleton. It answers the invite preview call itself, so no run
// reaches the API.

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const [base = 'http://127.0.0.1:8088'] = process.argv.slice(2)

const CANOPY = 'Probe canopy'
const LONG_CANOPY =
  'The Extraordinarily Overgrown Greenhouse Of Aunt Wilhelmina'

type Answer =
  | { readonly status: number; readonly body: unknown }
  | 'connection refused'

interface Case {
  readonly name: string
  readonly answer: Answer
  readonly heading: (t: Messages['Join']) => string
}

const CASES: ReadonlyArray<Case> = [
  {
    name: 'invite preview',
    answer: { status: 200, body: { canopyName: CANOPY, inviterName: 'Sam' } },
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

const VIEWPORTS = [
  { name: 'mobile', width: 412, height: 823, mobile: true },
  { name: 'small phone', width: 360, height: 640, mobile: true },
  { name: 'desktop', width: 1350, height: 940, mobile: false },
] as const

const CONSENTS = ['no stored choice', 'stored choice'] as const

const SKELETON_FRAMES = 10

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

// Records every layout shift, and the height of the card in the first frame, while it still holds the skeleton.
const PROBE = `window.joinFrames=0;(function count(){window.joinFrames++;requestAnimationFrame(count)})();window.joinShifts=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.joinShifts.push(e.value)}).observe({type:'layout-shift',buffered:true});requestAnimationFrame(()=>{window.joinSkeleton=document.querySelector('main > div')?.offsetHeight})`
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

  await send('Page.navigate', { url: `${base}/join/abc` })
  await until('load', `document.readyState === 'complete'`)
  // The join page has no locale in its path, so it follows the browser language.
  const t: Messages['Join'] = (
    await evaluate<string>('navigator.language')
  ).startsWith('fr')
    ? fr.Join
    : en.Join

  for (const viewport of VIEWPORTS) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    })
    for (const consent of CONSENTS)
      for (const c of CASES) {
        const name = `${c.name}, ${viewport.name}, ${consent}`
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
            heading: string
            shifts: Array<number>
            skeleton: number
            card: number
          }>(
            `({heading:document.querySelector('main h1').textContent,shifts:window.joinShifts,skeleton:window.joinSkeleton,card:document.querySelector('main > div').offsetHeight})`
          )
          const cls = Array.reduce(seen.shifts, 0, (sum, v) => sum + v)
          const ok = seen.heading === c.heading(t) && cls === 0
          if (!ok) failed = true
          console.log(
            `${ok ? 'ok  ' : 'FAIL'} ${name}\n     layout shift=${cls.toFixed(4)} (want 0)  heading="${seen.heading}" (want "${c.heading(t)}")  card height ${seen.skeleton}px as skeleton, ${seen.card}px after`
          )
        } catch (error) {
          failed = true
          console.log(
            `FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`
          )
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
