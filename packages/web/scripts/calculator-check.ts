import { Array, Option, Predicate, pipe } from 'effect'
import { fmt, type Locale, locales, plural } from '../src/i18n'
import { calculatorMessages } from '../src/i18n/calculator'
import {
  type CalculatorFactors,
  type CalculatorInput,
  calculate,
  cityById,
  defaultInput,
  MONTHS,
  plantById,
  TEMP_MAX_C,
  TEMP_MIN_C,
} from '../src/lib/watering-calculator'
import { launchChrome } from './chrome'

// usage: bun scripts/calculator-check.ts [base=http://127.0.0.1:8088]
// Fails when calculate() or the page disagrees with the numbers written in CASES, which were taken once from the
// shared indoor-demand functions called directly. It then drives headless Chrome over CDP against the prerendered
// build (`preview`), in English and in French, on two phones and a desktop, and also fails when the served HTML
// lacks the default result, when the page throws or logs an error, when the page reports more than MAX_CLS of layout
// shift by the time it has hydrated, and when the page is wider than the viewport.

const [base = 'http://127.0.0.1:8088'] = process.argv.slice(2)

const MAX_CLS = 0.02

const VIEWPORTS = [
  { name: 'small phone', width: 360, height: 640, mobile: true },
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'desktop', width: 1280, height: 800, mobile: false },
] as const

// Percentages are the whole numbers the page prints. humidity is the indoor relative humidity in the dry-air sentence.
interface Expected extends CalculatorFactors {
  readonly days: number
  readonly dimRoom: boolean
  readonly total: number
  readonly humidity: number
}

interface Case {
  readonly name: string
  readonly input: CalculatorInput
  readonly want: Expected
}

const CASES: ReadonlyArray<Case> = [
  {
    name: 'fiddle leaf fig in a dark London room, north window',
    input: {
      plantId: 'Ficus lyrata',
      light: 1,
      orientation: 'N',
      cityId: 'london',
      month: 2,
      outdoorTempC: 8,
    },
    want: {
      days: 9,
      dimRoom: true,
      total: -21,
      seasonLight: -6,
      window: -9,
      roomFit: -15,
      dryAir: 8,
      humidity: 35,
    },
  },
  {
    name: 'Paris winter, south window',
    input: {
      plantId: 'Monstera deliciosa',
      light: 3,
      orientation: 'S',
      cityId: 'paris',
      month: 12,
      outdoorTempC: 2,
    },
    want: {
      days: 6,
      dimRoom: false,
      total: 11,
      seasonLight: -9,
      window: 10,
      roomFit: 0,
      dryAir: 12,
      humidity: 26,
    },
  },
  {
    name: 'Sydney winter, north window',
    input: {
      plantId: 'Monstera deliciosa',
      light: 3,
      orientation: 'N',
      cityId: 'sydney',
      month: 7,
      outdoorTempC: 12,
    },
    want: {
      days: 6,
      dimRoom: false,
      total: 9,
      seasonLight: -4,
      window: 7,
      roomFit: 0,
      dryAir: 6,
      humidity: 41,
    },
  },
  {
    name: 'Sydney summer, south window',
    input: {
      plantId: 'Strelitzia reginae',
      light: 5,
      orientation: 'S',
      cityId: 'sydney',
      month: 1,
      outdoorTempC: 30,
    },
    want: {
      days: 7,
      dimRoom: false,
      total: 0,
      seasonLight: 6,
      window: -6,
      roomFit: 0,
      dryAir: 0,
      humidity: 55,
    },
  },
  {
    name: 'Montreal winter at -10 °C, no window',
    input: {
      plantId: 'Calathea orbifolia',
      light: 2,
      orientation: null,
      cityId: 'montreal',
      month: 12,
      outdoorTempC: -10,
    },
    want: {
      days: 5,
      dimRoom: false,
      total: 3,
      seasonLight: -9,
      window: 0,
      roomFit: 0,
      dryAir: 13,
      humidity: 25,
    },
  },
  {
    name: 'cactus in full sun at 40 °C',
    input: {
      plantId: 'Opuntia microdasys',
      light: 5,
      orientation: 'SW',
      cityId: 'los-angeles',
      month: 8,
      outdoorTempC: 40,
    },
    want: {
      days: 20,
      dimRoom: false,
      total: 5,
      seasonLight: 2,
      window: 3,
      roomFit: 0,
      dryAir: 0,
      humidity: 55,
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
    want: {
      days: 2,
      dimRoom: false,
      total: 9,
      seasonLight: 3,
      window: 0,
      roomFit: 6,
      dryAir: 0,
      humidity: 55,
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
    want: {
      days: 15,
      dimRoom: false,
      total: -6,
      seasonLight: -10,
      window: -5,
      roomFit: 0,
      dryAir: 10,
      humidity: 26,
    },
  },
]

// The interval the served HTML shows for defaultInput(locale), taken from the shared model like CASES.
const PRERENDERED_DAYS: Record<Locale, number> = { en: 7, fr: 7 }

const FACTORS: ReadonlyArray<keyof CalculatorFactors> = [
  'seasonLight',
  'window',
  'roomFit',
  'dryAir',
]

// A case list that lost one of these inputs would still pass, so the list itself is checked first.
const north = (c: Case) => cityById(c.input.cityId).latitude > 0
const covers = (what: string, found: boolean) =>
  found ? null : `no case has ${what}`
const coverage = Array.filter(
  [
    covers(
      'a dim room',
      Array.some(CASES, (c) => c.want.dimRoom)
    ),
    ...Array.flatMap([true, false], (inNorth) =>
      Array.map(['N', 'S'] as const, (o) =>
        covers(
          `a ${o} window in the ${inNorth ? 'northern' : 'southern'} hemisphere`,
          Array.some(
            CASES,
            (c) => north(c) === inNorth && c.input.orientation === o
          )
        )
      )
    ),
    covers(
      'a succulent',
      Array.some(
        CASES,
        (c) => plantById(c.input.plantId).category === 'Succulent'
      )
    ),
    covers(
      `${TEMP_MIN_C} °C`,
      Array.some(CASES, (c) => c.input.outdoorTempC === TEMP_MIN_C)
    ),
    covers(
      `${TEMP_MAX_C} °C`,
      Array.some(CASES, (c) => c.input.outdoorTempC === TEMP_MAX_C)
    ),
  ],
  Predicate.isNotNull
)
if (coverage.length > 0) {
  for (const problem of coverage) console.log(`FAIL ${problem}`)
  process.exit(1)
}

const percentOf = (factor: number): number => Math.round((factor - 1) * 100)

const differences = (want: Expected, got: Expected): ReadonlyArray<string> =>
  Array.flatMap(
    [
      'days',
      'dimRoom',
      'total',
      ...FACTORS,
      'humidity',
    ] as const satisfies ReadonlyArray<keyof Expected>,
    (key) =>
      got[key] === want[key] ? [] : [`${key} ${got[key]} (want ${want[key]})`]
  )

const interval = (locale: Locale, days: number) =>
  plural(locale, days, calculatorMessages[locale].result.every)

const percentText = (locale: Locale, pct: number) =>
  fmt(calculatorMessages[locale].result.percent, {
    value: pct > 0 ? `+${pct}` : pct < 0 ? `−${-pct}` : '0',
  })

const totalText = (locale: Locale, pct: number) =>
  fmt(calculatorMessages[locale].result.total, {
    value: percentText(locale, pct),
  })

const thisMonth = pipe(
  Array.get(MONTHS, new Date().getMonth()),
  Option.getOrThrow
)

const report = (name: string, problems: ReadonlyArray<string>, detail = '') => {
  console.log(
    `${problems.length === 0 ? 'ok  ' : 'FAIL'} ${name}${detail === '' ? '' : `\n     ${detail}`}${problems.map((p) => `\n     ${p}`).join('')}`
  )
  return problems.length > 0
}

let failed = false
for (const c of CASES) {
  const r = calculate(c.input)
  failed =
    report(
      `calculate(), ${c.name}`,
      differences(c.want, {
        days: r.days,
        dimRoom: r.dimRoom,
        total: percentOf(r.demand),
        seasonLight: percentOf(r.factors.seasonLight),
        window: percentOf(r.factors.window),
        roomFit: percentOf(r.factors.roomFit),
        dryAir: percentOf(r.factors.dryAir),
        humidity: Math.round(r.indoorHumidity),
      })
    ) || failed
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const chrome = await launchChrome()
const target = (await (
  await fetch(`http://127.0.0.1:${chrome.port}/json/new?about:blank`, {
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

interface Seen {
  readonly days: string
  readonly dim: boolean
  readonly total: string
  readonly factors: Record<keyof CalculatorFactors, string>
  readonly humidity: number | null
  readonly width: number
}

const SEEN = `(() => {
  const text = (selector) => document.querySelector(selector)?.textContent ?? ''
  const factors = Object.fromEntries(${JSON.stringify(FACTORS)}.map((k) => [k, text('[data-factor="' + k + '"] .tabular-nums')]))
  const rh = text('[data-factor="dryAir"] p:last-child').match(/(\\d+)\\s?%/)
  return {
    days: text('#calc-days'),
    dim: document.getElementById('calc-dim') !== null,
    total: text('#calc-total'),
    factors,
    humidity: rh ? Number(rh[1]) : null,
    width: document.documentElement.scrollWidth,
  }
})()`

const pageDifferences = (
  locale: Locale,
  want: Expected,
  seen: Seen
): ReadonlyArray<string> =>
  Array.filter(
    [
      seen.days === interval(locale, want.days)
        ? null
        : `interval "${seen.days}" (want "${interval(locale, want.days)}")`,
      seen.dim === want.dimRoom
        ? null
        : `dim-room warning ${seen.dim ? 'shown' : 'missing'} (want ${want.dimRoom ? 'shown' : 'none'})`,
      seen.total === totalText(locale, want.total)
        ? null
        : `total "${seen.total}" (want "${totalText(locale, want.total)}")`,
      ...Array.map(FACTORS, (key) =>
        seen.factors[key] === percentText(locale, want[key])
          ? null
          : `${key} "${seen.factors[key]}" (want "${percentText(locale, want[key])}")`
      ),
      seen.humidity === want.humidity
        ? null
        : `dry-air humidity ${seen.humidity} (want ${want.humidity})`,
    ],
    Predicate.isNotNull
  )

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
    const wantPrerendered = interval(locale, PRERENDERED_DAYS[locale])
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
        const seen = await evaluate<Seen>(SEEN)
        const loaded = interval(
          locale,
          calculate({ ...defaultInput(locale), month: thisMonth }).days
        )
        failed =
          report(
            `${page}, after load`,
            Array.filter(
              [
                seen.days === loaded
                  ? null
                  : `interval "${seen.days}" (want "${loaded}" for the current month)`,
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
          const shown = await evaluate<Seen>(SEEN)
          failed =
            report(
              `${page}, ${c.name}`,
              [
                ...pageDifferences(locale, c.want, shown),
                ...(shown.width <= viewport.width
                  ? []
                  : [
                      `the page is ${shown.width}px wide in a ${viewport.width}px viewport`,
                    ]),
              ],
              `"${shown.days}", ${shown.total}${shown.dim ? ', dim-room warning' : ''}`
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
  await chrome.close()
}
process.exit(failed ? 1 : 0)
