import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Array, Option } from 'effect'
import { en } from '../src/i18n/en'
import { fr } from '../src/i18n/fr'

// usage: bun scripts/consent-check.ts [base=http://127.0.0.1:8088]
// Drives headless Chrome over CDP against the prerendered build (`preview`) and fails when the site contacts Google
// or holds a Google Analytics cookie without consent. It needs network access to Google for the Accept steps.

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const [base = 'http://127.0.0.1:8088'] = process.argv.slice(2)
// The tag loads from an idle callback with a 5 s timeout, so a quiet page has settled after this.
const SETTLE_MS = 6500
// Every page bundle is held until the prerendered page has painted this many frames, so no load hydrates before the paint probe has seen it.
const PRERENDERED_FRAMES = 10
const DAY_MS = 24 * 60 * 60 * 1000
const GOOGLE =
  /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net)$/

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const profile = mkdtempSync(join(tmpdir(), 'lily-consent-'))
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
let requests: Array<string> = []
let bundles: 'held' | 'blocked' = 'held'
const send = <T>(method: string, params: object = {}): Promise<T> =>
  new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, (result) => resolve(result as T))
    socket.send(JSON.stringify({ id, method, params }))
  })
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data)) as {
    id?: number
    result?: unknown
    method?: string
    params?: { requestId?: string; request?: { url: string } }
  }
  if (message.id !== undefined) pending.get(message.id)?.(message.result)
  if (message.method === 'Network.requestWillBeSent' && message.params?.request)
    requests.push(message.params.request.url)
  if (message.method === 'Fetch.requestPaused' && message.params?.requestId)
    void onBundle(message.params.requestId)
})

const evaluate = async <T>(expression: string): Promise<T> =>
  (
    await send<{ result: { value: T } }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
    })
  ).result.value

const until = async (what: string, expression: string) => {
  for (let i = 0; i < 100; i++) {
    if (await evaluate<boolean>(expression)) return
    await sleep(100)
  }
  throw new Error(`timed out waiting for ${what}`)
}

let failed = false
const onBundle = async (requestId: string) => {
  if (bundles === 'blocked')
    return send('Fetch.failRequest', {
      requestId,
      errorReason: 'BlockedByClient',
    })
  try {
    await until(
      'the prerendered page to paint',
      `window.consentFrames >= ${PRERENDERED_FRAMES}`
    )
  } catch (error) {
    failed = true
    console.log(
      `FAIL ${error instanceof Error ? error.message : String(error)}`
    )
  }
  return send('Fetch.continueRequest', { requestId })
}

const googleRequests = () =>
  Array.filter(requests, (url) => GOOGLE.test(new URL(url).hostname))
const gaCookies = async () =>
  Array.filter(
    (
      await send<{ cookies: Array<{ name: string; value: string }> }>(
        'Network.getAllCookies'
      )
    ).cookies,
    (c) => c.name.startsWith('_ga')
  )
const clientId = async () =>
  Array.findFirst(await gaCookies(), (c) => c.name === '_ga').pipe(
    Option.map((c) => c.value),
    Option.getOrElse(() => '(no _ga cookie)')
  )

const BANNER = `(b => b !== null && b.getClientRects().length > 0)(document.querySelector('.m-consent'))`
const PAINT_PROBE = `(function probe(){window.consentFrames=(window.consentFrames||0)+1;if(${BANNER})window.consentPainted=true;requestAnimationFrame(probe)})()`
const hydrated = () =>
  until('hydration', `document.querySelector('footer button') !== null`)
const clickButton = (label: string) =>
  evaluate<boolean>(
    `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});b?.click();return b!==undefined})()`
  )
const open = async (path: string) => {
  requests = []
  await send('Page.navigate', { url: `${base}${path}` })
  await until('load', `document.readyState === 'complete'`)
}
const reload = async () => {
  requests = []
  await send('Page.reload')
  await sleep(300)
  await until('load', `document.readyState === 'complete'`)
}

const step = async (
  name: string,
  expected: { banner: boolean; google: boolean; cookies: boolean }
) => {
  await sleep(SETTLE_MS)
  const seen = {
    banner: await evaluate<boolean>(BANNER),
    google: googleRequests(),
    cookies: Array.map(await gaCookies(), (c) => c.name),
  }
  const ok =
    seen.banner === expected.banner &&
    Array.isReadonlyArrayNonEmpty(seen.google) === expected.google &&
    Array.isReadonlyArrayNonEmpty(seen.cookies) === expected.cookies
  if (!ok) failed = true
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}\n     banner=${seen.banner} (want ${expected.banner})  google requests=${seen.google.length} (want ${expected.google ? 'some' : 'none'})  _ga cookies=[${seen.cookies.join(', ')}] (want ${expected.cookies ? 'some' : 'none'})`
  )
  for (const url of Array.dedupe(
    Array.map(seen.google, (u) => u.split('?')[0])
  ))
    console.log(`     -> ${url}`)
}

const neverPainted = async (name: string) => {
  const painted = await evaluate<boolean>('window.consentPainted === true')
  if (painted) failed = true
  console.log(
    `${painted ? 'FAIL' : 'ok  '} ${name}, the banner showed in no frame`
  )
}

const NONE = { google: false, cookies: false }
const LOADED = { google: true, cookies: true }

try {
  await send('Network.enable')
  await send('Page.enable')
  // A cached bundle skips the Fetch domain, so nothing would hold it.
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/assets/*.js' }] })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PAINT_PROBE })

  const html = await (await fetch(`${base}/en`)).text()
  const inHtml = /googletagmanager|google-analytics/.test(html)
  if (inHtml) failed = true
  console.log(
    `${inHtml ? 'FAIL' : 'ok  '} prerendered /en HTML names no Google Analytics host`
  )

  await open('/en')
  await step('fresh visit to /en', { banner: true, ...NONE })
  if (failed) throw new Error('the site does not ask before loading analytics')

  await clickButton(en.Consent.refuse)
  await step('after Refuse', { banner: false, ...NONE })

  requests = []
  await evaluate(`document.querySelector('footer a[href="/en/about"]').click()`)
  await until('client navigation', `location.pathname === '/en/about'`)
  await step('Refuse, after a client navigation to /en/about', {
    banner: false,
    ...NONE,
  })

  await reload()
  await step('Refuse, after a reload', { banner: false, ...NONE })
  await neverPainted('Refuse, after a reload')

  await hydrated()
  await clickButton(en.Consent.settings)
  await until('banner', BANNER)
  await step('Refuse, banner reopened from the footer', {
    banner: true,
    ...NONE,
  })

  requests = []
  await clickButton(en.Consent.accept)
  await step('changed to Accept', { banner: false, ...LOADED })

  const accepted = await clientId()
  await reload()
  await step('Accept, after a reload', { banner: false, ...LOADED })
  await neverPainted('Accept, after a reload')
  const reloaded = await clientId()
  if (reloaded !== accepted) failed = true
  console.log(
    `${reloaded === accepted ? 'ok  ' : 'FAIL'} Accept, the _ga client id survives the reload\n     before=${accepted}  after=${reloaded}`
  )

  await hydrated()
  await clickButton(en.Consent.settings)
  await until('banner', BANNER)
  requests = []
  await clickButton(en.Consent.refuse)
  await step('changed back to Refuse', { banner: false, ...NONE })

  requests = []
  await evaluate(`gtag('event', 'consent_check')`)
  await step('Refuse again, after a Google Analytics event on the same page', {
    banner: false,
    ...NONE,
  })

  requests = []
  await evaluate(`document.querySelector('footer a[href="/en/blog"]').click()`)
  await until('client navigation', `location.pathname === '/en/blog'`)
  await step('Refuse again, after a client navigation to /en/blog', {
    banner: false,
    ...NONE,
  })

  await reload()
  await step('Refuse again, after a reload', { banner: false, ...NONE })

  await evaluate(
    `localStorage.setItem('analytics-consent', 'granted:' + (Date.now() - ${400 * DAY_MS}))`
  )
  await reload()
  await step('an Accept older than 180 days, after a reload', {
    banner: true,
    ...NONE,
  })

  await evaluate(`localStorage.clear()`)
  bundles = 'blocked'
  await open('/en/blog')
  await step('fresh visit to /en/blog, bundles blocked so it never hydrates', {
    banner: true,
    ...NONE,
  })
  bundles = 'held'

  await send('Emulation.setScriptExecutionDisabled', { value: true })
  await open('/en/blog')
  await step('fresh visit to /en/blog with JavaScript disabled', {
    banner: false,
    ...NONE,
  })
  await send('Emulation.setScriptExecutionDisabled', { value: false })

  await open('/join/abc')
  await step('fresh visit to the join page', { banner: true, ...NONE })

  // The join page has no locale in its path, so it follows the browser language.
  const join = (await evaluate<string>('navigator.language')).startsWith('fr')
    ? fr
    : en
  await clickButton(join.Consent.refuse)
  await until('banner closed', `!(${BANNER})`)
  await clickButton(join.Consent.settings)
  await until('banner', BANNER)
  await step('join page, banner reopened from its own button', {
    banner: true,
    ...NONE,
  })
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
