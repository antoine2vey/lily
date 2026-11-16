import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Array, Option, pipe, Record, String } from 'effect'

// usage: bun scripts/hydration-check.ts [base=http://127.0.0.1:8088]
// Opens one page per route and locale of the prerendered build (`preview`) in headless Chrome and fails when a page
// throws or logs an error, never hydrates, or ends with a title, description or robots meta other than its prerendered
// HTML holds.
// It answers the invite preview call itself and blocks every other request that leaves `base`, so no run reaches the API.

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const [base = 'http://127.0.0.1:8088'] = process.argv.slice(2)

// The noindex pages are missing from sitemap.xml. nginx serves the prerendered /join page at every /join/<token>, the one
// page hydrated at a path it was not built for (#219).
const NOINDEX_PATHS = ['/join', '/join/hydration-check-token']

const HEAD_TAGS = {
  title: 'head > title',
  description: 'head > meta[name="description"]',
  robots: 'head > meta[name="robots"]',
} as const
type HeadTag = keyof typeof HEAD_TAGS
type Head = Record<HeadTag, ReadonlyArray<string>>
const sameValues = Array.makeEquivalence<string>((x, y) => x === y)

const WAIT_MS = 10_000
// A cold CI runner took about 8 s to serve the sitemap and start Chrome, so startup gets its own wide budget.
const STARTUP_MS = 60_000
const HYDRATED = `Object.keys(document.body).some((key) => key.startsWith('__reactFiber$'))`
// After a mismatch React throws the prerendered nodes away and renders the page again on the client, some time after
// the first commit. The page counts as settled once no node has been added or removed for QUIET_MS.
const QUIET_MS = 500
const WATCH_NODES = `window.lastNodeChange = 0; new MutationObserver(() => { window.lastNodeChange = performance.now() }).observe(document, { childList: true, subtree: true })`
const QUIET = `performance.now() - window.lastNodeChange > ${QUIET_MS}`

const CORS = [
  { name: 'access-control-allow-origin', value: '*' },
  { name: 'access-control-allow-headers', value: 'content-type' },
  { name: 'access-control-allow-methods', value: 'POST' },
  { name: 'content-type', value: 'application/json' },
]
const INVITE_PREVIEW = { canopyName: 'Probe canopy', inviterName: 'Sam' }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const served = async () => {
  for (let waited = 0; waited < STARTUP_MS; waited += 200) {
    try {
      const response = await fetch(`${base}/sitemap.xml`)
      if (response.ok) return await response.text()
    } catch {
      // The server is still starting.
    }
    await sleep(200)
  }
  throw new Error(`${base}/sitemap.xml did not answer`)
}

// Below the locale, the last segment of a nested path is read as a route parameter, so every /en/blog/<slug> is one
// route and every /en/blog/page/<n> another.
const routeOf = (path: string) => {
  const segments = Array.filter(String.split(path, '/'), String.isNonEmpty)
  return segments.length > 2
    ? Array.join([...Array.dropRight(segments, 1), '*'], '/')
    : path
}

const samplePaths = (sitemap: string) =>
  pipe(
    Array.fromIterable(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)),
    Array.map((m) => Option.fromNullishOr(m[1])),
    Array.getSomes,
    Array.map((loc) => new URL(loc).pathname),
    Array.dedupeWith((a, b) => routeOf(a) === routeOf(b))
  )

const PATHS = [...samplePaths(await served()), ...NOINDEX_PATHS]

const profile = mkdtempSync(join(tmpdir(), 'lily-hydration-'))
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
  for (let waited = 0; waited < STARTUP_MS; waited += 100) {
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
const pending = new Map<
  number,
  { resolve: (result: unknown) => void; reject: (error: Error) => void }
>()
const closed = () => new Error('Chrome closed the debugging connection')
const send = <T>(method: string, params: object = {}): Promise<T> =>
  new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) return reject(closed())
    const id = ++nextId
    pending.set(id, { resolve: (result) => resolve(result as T), reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
socket.addEventListener('close', () => {
  for (const { reject } of pending.values()) reject(closed())
  pending.clear()
})

const evaluate = async <T>(expression: string): Promise<T> =>
  (
    await send<{ result: { value: T } }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
  ).result.value

let errors: Array<string> = []
let blocked: Array<string> = []
let onLoad = () => {}

const origin = new URL(base).origin
const onRequest = (requestId: string, url: string, method: string) => {
  if (new URL(url).origin === origin)
    return send('Fetch.continueRequest', { requestId })
  if (String.includes('canopy-invites/preview')(url)) {
    const preflight = method === 'OPTIONS'
    return send('Fetch.fulfillRequest', {
      requestId,
      responseCode: preflight ? 204 : 200,
      responseHeaders: CORS,
      body: preflight ? '' : btoa(JSON.stringify(INVITE_PREVIEW)),
    })
  }
  blocked.push(url)
  return send('Fetch.failRequest', {
    requestId,
    errorReason: 'BlockedByClient',
  })
}

const firstLine = (text: string) =>
  pipe(text, String.split('\n'), Array.headNonEmpty)

interface CdpEvents {
  'Page.loadEventFired': object
  'Fetch.requestPaused': {
    readonly requestId: string
    readonly request: { readonly url: string; readonly method: string }
  }
  'Runtime.exceptionThrown': {
    readonly exceptionDetails: {
      readonly text: string
      readonly exception?: { readonly description?: string }
    }
  }
  'Runtime.consoleAPICalled': {
    readonly type: string
    readonly args: ReadonlyArray<{
      readonly value?: unknown
      readonly description?: string
    }>
  }
  'Log.entryAdded': {
    readonly entry: {
      readonly level: string
      readonly text: string
      readonly url?: string
    }
  }
}
// Chrome sends other events too. They match none of the branches below.
type CdpMessage =
  | { readonly id: number; readonly result: unknown }
  | {
      [M in keyof CdpEvents]: {
        readonly method: M
        readonly params: CdpEvents[M]
      }
    }[keyof CdpEvents]

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data as string) as CdpMessage
  if ('id' in message) return pending.get(message.id)?.resolve(message.result)
  if (message.method === 'Page.loadEventFired') return onLoad()
  if (message.method === 'Fetch.requestPaused')
    return void onRequest(
      message.params.requestId,
      message.params.request.url,
      message.params.request.method
    )
  if (message.method === 'Runtime.exceptionThrown') {
    const { exception, text } = message.params.exceptionDetails
    return errors.push(firstLine(exception?.description ?? text))
  }
  if (
    message.method === 'Runtime.consoleAPICalled' &&
    message.params.type === 'error'
  )
    return errors.push(
      firstLine(
        pipe(
          message.params.args,
          Array.map((a) => globalThis.String(a.value ?? a.description)),
          Array.join(' ')
        )
      )
    )
  if (
    message.method === 'Log.entryAdded' &&
    message.params.entry.level === 'error'
  ) {
    const { text, url = '' } = message.params.entry
    return errors.push(`${text} ${url}`.trim())
  }
})

// The prerendered head is read from the bytes nginx serves for this very path, so /join/<token> compares with join.html.
const READ_HEADS = `(async () => {
  const tags = ${JSON.stringify(HEAD_TAGS)}
  const read = (doc) => Object.fromEntries(Object.entries(tags).map(([tag, selector]) =>
    [tag, Array.from(doc.querySelectorAll(selector), (el) => el.tagName === 'TITLE' ? el.textContent : el.getAttribute('content'))]))
  const html = await (await fetch(location.href, { cache: 'no-store' })).text()
  return { prerendered: read(new DOMParser().parseFromString(html, 'text/html')), hydrated: read(document) }
})()`

const until = async (expression: string, timeoutMs: number) => {
  for (let waited = 0; waited < timeoutMs; waited += 100) {
    if (await evaluate<boolean>(expression)) return true
    await sleep(100)
  }
  return false
}

const show = (values: ReadonlyArray<string>) =>
  Array.isReadonlyArrayEmpty(values)
    ? '(none)'
    : pipe(
        values,
        Array.map((v) => JSON.stringify(v)),
        Array.join(', ')
      )

const check = async (path: string): Promise<Array<string>> => {
  errors = []
  blocked = []
  const loaded = new Promise<boolean>((resolve) => {
    onLoad = () => resolve(true)
    setTimeout(() => resolve(false), WAIT_MS)
  })
  await send('Page.navigate', { url: `${base}${path}` })
  if (!(await loaded)) return ['did not load', ...errors]
  if (!(await until(HYDRATED, WAIT_MS))) return ['did not hydrate', ...errors]
  await until(QUIET, WAIT_MS)
  const { prerendered, hydrated } = await evaluate<{
    prerendered: Head
    hydrated: Head
  }>(READ_HEADS)
  const changed = pipe(
    Record.keys(HEAD_TAGS),
    Array.filter((tag) => !sameValues(prerendered[tag], hydrated[tag])),
    Array.map(
      (tag) =>
        `${tag} changed after hydration: ${show(prerendered[tag])} -> ${show(hydrated[tag])}`
    )
  )
  return [
    ...Array.map(errors, (e) => `error: ${e}`),
    ...changed,
    ...Array.map(
      blocked,
      (url) => `blocked a request that leaves ${origin}: ${url}`
    ),
  ]
}

let failed = false
const started = performance.now()
try {
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH_NODES })

  for (const path of PATHS) {
    const findings = await check(path)
    if (findings.length > 0) failed = true
    console.log(`${findings.length === 0 ? 'ok  ' : 'FAIL'} ${path}`)
    for (const finding of findings) console.log(`     ${finding}`)
  }
} catch (error) {
  failed = true
  console.log(
    `FAIL ${error instanceof Error ? error.message : globalThis.String(error)}`
  )
} finally {
  socket.close()
  chrome.kill()
  await chrome.exited
  rmSync(profile, { recursive: true, force: true })
}
console.log(
  `${PATHS.length} pages in ${((performance.now() - started) / 1000).toFixed(1)} s`
)
process.exit(failed ? 1 : 0)
