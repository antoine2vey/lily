import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Array, Option, Predicate, pipe } from 'effect'
import { type Locale, locales, plural } from '../src/i18n'
import { calculatorMessages } from '../src/i18n/calculator'
import {
  type CalculatorInput,
  calculate,
  cityById,
  defaultInput,
  MONTHS,
} from '../src/lib/watering-calculator'

// usage: bun scripts/calculator-check.ts [base=http://127.0.0.1:8088]
// Drives headless Chrome over CDP against the prerendered build (`preview`), in English and in French, on two phones
// and a desktop. It fails when the served HTML lacks the default result, when the page throws or logs an error, when
// the page reports more than MAX_CLS of layout shift by the time it has hydrated, when the page is wider than the
// viewport, and when the interval or the dim-room warning on screen differs from calculate() for any of CASES.

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const [base = 'http://127.0.0.1:8088'] = process.argv.slice(2)

const MAX_CLS = 0.02

const VIEWPORTS = [
  { name: 'small phone', width: 360, height: 640, mobile: true },
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'desktop', width: 1280, height: 800, mobile: false },
] as const

interface Case {
  readonly name: string
  readonly input: CalculatorInput
}

const CASES: ReadonlyArray<Case> = [
  {
    name: 'fiddle leaf fig in a dark room',
    input: {
      plantId: 'Ficus lyrata',
      light: 1,
      orientation: 'N',
      cityId: 'london',
      month: 2,
      outdoorTempC: 8,
    },
  },
  {
    name: 'Sydney winter, equator-facing window',
    input: {
      plantId: 'Monstera deliciosa',
      light: 3,
      orientation: 'N',
      cityId: 'sydney',
      month: 7,
      outdoorTempC: 12,
    },
  },
  {
    name: 'Sydney summer, pole-facing window',
    input: {
      plantId: 'Strelitzia reginae',
      light: 5,
      orientation: 'S',
      cityId: 'sydney',
      month: 1,
      outdoorTempC: 30,
    },
  },
  {
    name: 'Montreal winter, dry air',
    input: {
      plantId: 'Calathea orbifolia',
      light: 2,
      orientation: null,
      cityId: 'montreal',
      month: 12,
      outdoorTempC: -10,
    },
  },
  {
    name: 'cactus in full sun',
    input: {
      plantId: 'Opuntia microdasys',
      light: 5,
      orientation: 'SW',
      cityId: 'los-angeles',
      month: 8,
      outdoorTempC: 35,
    },
  },
  {
    name: 'fern near the equator',
    input: {
      plantId: 'Adiantum raddianum',
      light: 3,
      orientation: 'E',
      cityId: 'singapore',
      month: 6,
      outdoorTempC: 28,
    },
  },
  {
    name: 'ZZ plant in a northern winter',
    input: {
      plantId: 'Zamioculcas zamiifolia',
      light: 1,
      orientation: 'NW',
      cityId: 'edinburgh',
      month: 12,
      outdoorTempC: 2,
    },
  },
]

// A case list that lost its dim or southern case would still pass, so the list itself is checked first.
const coverage = Array.filter(
  [
    Array.some(CASES, (c) => calculate(c.input).dimRoom)
      ? null
      : 'no case has a dim room',
    Array.some(CASES, (c) => cityById(c.input.cityId).latitude < 0)
      ? null
      : 'no case is in the southern hemisphere',
  ],
  Predicate.isNotNull
)
if (coverage.length > 0) {
  for (const problem of coverage) console.log(`FAIL ${problem}`)
  process.exit(1)
}

const interval = (locale: Locale, input: CalculatorInput) =>
  plural(locale, calculate(input).days, calculatorMessages[locale].result.every)

const thisMonth = pipe(
  Array.get(MONTHS, new Date().getMonth()),
  Option.getOrThrow
)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const profile = mkdtempSync(join(tmpdir(), 'lily-calculator-'))
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
let errors: Array<string> = []
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

socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data)) as {
    id?: number
    result?: unknown
    method?: string
    params?: {
      type?: string
      args?: ReadonlyArray<{ value?: unknown; description?: string }>
      exceptionDetails?: {
        text: string
        exception?: { description?: string }
      }
      entry?: { level: string; text: string; url?: string }
    }
  }
  if (message.id !== undefined) pending.get(message.id)?.(message.result)
  const params = message.params
  if (message.method === 'Runtime.exceptionThrown' && params?.exceptionDetails)
    errors.push(
      params.exceptionDetails.exception?.description ??
        params.exceptionDetails.text
    )
  if (message.method === 'Runtime.consoleAPICalled' && params?.type === 'error')
    errors.push(
      (params.args ?? []).map((a) => String(a.value ?? a.description)).join(' ')
    )
  if (message.method === 'Log.entryAdded' && params?.entry?.level === 'error')
    errors.push(`${params.entry.text} ${params.entry.url ?? ''}`.trim())
})

const PROBE = `window.calcShifts=[];new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.calcShifts.push(e.value)}).observe({type:'layout-shift',buffered:true})`
const HYDRATED = `Object.keys(document.body).some((key) => key.startsWith('__reactFiber$'))`
const TWO_FRAMES = `new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))`

// React tracks the last value it rendered on each input, so the value goes through the native setter and the event
// that React listens to for that kind of control.
const setInputs = (input: CalculatorInput) => `(() => {
  const set = (id, value, event) => {
    const el = document.getElementById(id)
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new Event(event, { bubbles: true }))
  }
  set('calc-plant', ${JSON.stringify(input.plantId)}, 'change')
  set('calc-city', ${JSON.stringify(input.cityId)}, 'change')
  set('calc-month', '${input.month}', 'change')
  set('calc-temp', '${input.outdoorTempC}', 'input')
  document.querySelector('input[name="light"][value="${input.light}"]').click()
  document.querySelector('input[name="window"][value="${input.orientation ?? ''}"]').click()
  return true
})()`

const SEEN = `({days:document.getElementById('calc-days').textContent,dim:document.getElementById('calc-dim')!==null,width:document.documentElement.scrollWidth})`

const report = (name: string, problems: ReadonlyArray<string>, detail = '') => {
  console.log(
    `${problems.length === 0 ? 'ok  ' : 'FAIL'} ${name}${detail === '' ? '' : `\n     ${detail}`}${problems.map((p) => `\n     ${p}`).join('')}`
  )
  return problems.length > 0
}

let failed = false
try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE })

  for (const locale of locales) {
    const url = `${base}/${locale}/watering-calculator`
    const html = await (await fetch(url)).text()
    const prerendered = pipe(
      Option.fromNullishOr(html.match(/id="calc-days"[^>]*>([^<]*)</)?.[1]),
      Option.getOrElse(() => '(missing)')
    )
    const wantPrerendered = interval(locale, defaultInput(locale))
    failed =
      report(
        `${locale}, prerendered HTML`,
        prerendered === wantPrerendered
          ? []
          : [`interval "${prerendered}" (want "${wantPrerendered}")`]
      ) || failed

    for (const viewport of VIEWPORTS) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
      })
      errors = []
      const page = `${locale}, ${viewport.name}`
      try {
        await send('Page.navigate', { url })
        await until('load', `document.readyState === 'complete'`)
        await until('hydration', HYDRATED)
        await until(
          'the current month',
          `document.getElementById('calc-month').value === '${thisMonth}'`
        )
        await evaluate(TWO_FRAMES)
        await sleep(300)
        const shifts = await evaluate<Array<number>>('window.calcShifts')
        const cls = Array.reduce(shifts, 0, (sum, v) => sum + v)
        const seen = await evaluate<{ days: string; width: number }>(SEEN)
        const loaded = { ...defaultInput(locale), month: thisMonth }
        failed =
          report(
            `${page}, after load`,
            Array.filter(
              [
                seen.days === interval(locale, loaded)
                  ? null
                  : `interval "${seen.days}" (want "${interval(locale, loaded)}" for the current month)`,
                cls <= MAX_CLS
                  ? null
                  : `layout shift ${cls.toFixed(4)} (want at most ${MAX_CLS})`,
                seen.width <= viewport.width
                  ? null
                  : `the page is ${seen.width}px wide in a ${viewport.width}px viewport`,
              ],
              Predicate.isNotNull
            ),
            `CLS ${cls.toFixed(4)}, "${seen.days}"`
          ) || failed

        for (const c of CASES) {
          await evaluate(setInputs(c.input))
          await evaluate(TWO_FRAMES)
          const shown = await evaluate<{
            days: string
            dim: boolean
            width: number
          }>(SEEN)
          const want = interval(locale, c.input)
          const { dimRoom } = calculate(c.input)
          failed =
            report(
              `${page}, ${c.name}`,
              Array.filter(
                [
                  shown.days === want
                    ? null
                    : `interval "${shown.days}" (want "${want}")`,
                  shown.dim === dimRoom
                    ? null
                    : `dim-room warning ${shown.dim ? 'shown' : 'missing'} (want ${dimRoom ? 'shown' : 'none'})`,
                  shown.width <= viewport.width
                    ? null
                    : `the page is ${shown.width}px wide in a ${viewport.width}px viewport`,
                ],
                Predicate.isNotNull
              ),
              `"${shown.days}"${shown.dim ? ', dim-room warning' : ''}`
            ) || failed
        }
      } catch (error) {
        failed = true
        console.log(
          `FAIL ${page}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
      failed =
        report(
          `${page}, console`,
          Array.map(errors, (e) => `error: ${e.split('\n')[0]}`)
        ) || failed
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
