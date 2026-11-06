import { mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Array, Order } from 'effect'

// usage: bun scripts/lighthouse.ts [base=http://127.0.0.1:8088] [paths...]
// Runs mobile Lighthouse 3 times per page against the prerendered build (`preview`) and fails on a budget breach.

const RUNS = 3
const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

interface Budget {
  readonly key: string
  readonly read: (report: Report) => number
  readonly ok: (value: number) => boolean
  readonly show: (value: number) => string
}

interface Report {
  readonly categories: Record<string, { readonly score: number | null }>
  readonly audits: Record<string, { readonly numericValue?: number }>
  readonly environment: { readonly benchmarkIndex: number }
}

// Below this, Lighthouse's own slow-CPU warning fires and timing metrics reflect machine load, not the page.
const MIN_BENCHMARK = 1000
const TIMING = new Set(['perf', 'LCP', 'TBT'])

const score = (category: string) => (r: Report) =>
  Math.round((r.categories[category]?.score ?? 0) * 100)
const metric = (audit: string) => (r: Report) =>
  r.audits[audit]?.numericValue ?? Infinity

const BUDGETS: ReadonlyArray<Budget> = [
  { key: 'perf', read: score('performance'), ok: (v) => v >= 95, show: String },
  { key: 'seo', read: score('seo'), ok: (v) => v === 100, show: String },
  {
    key: 'bp',
    read: score('best-practices'),
    ok: (v) => v === 100,
    show: String,
  },
  {
    key: 'a11y',
    read: score('accessibility'),
    ok: (v) => v >= 95,
    show: String,
  },
  {
    key: 'LCP',
    read: metric('largest-contentful-paint'),
    ok: (v) => v < 2000,
    show: (v) => `${Math.round(v)}ms`,
  },
  {
    key: 'CLS',
    read: metric('cumulative-layout-shift'),
    ok: (v) => v < 0.05,
    show: (v) => v.toFixed(3),
  },
  {
    key: 'TBT',
    read: metric('total-blocking-time'),
    ok: (v) => v < 150,
    show: (v) => `${Math.round(v)}ms`,
  },
]

const [base = 'http://127.0.0.1:8088', ...rest] = process.argv.slice(2)
const paths = Array.isReadonlyArrayNonEmpty(rest)
  ? rest
  : [
      '/en',
      '/en/blog',
      '/en/blog/advanced-pothos-pruning-techniques',
      '/en/about',
    ]
const outDir = join(tmpdir(), 'lily-lighthouse')
mkdirSync(outDir, { recursive: true })

const run = async (path: string, i: number): Promise<Report> => {
  const out = join(outDir, `${path.replace(/\W+/g, '_')}-${i}.json`)
  const proc = Bun.spawn(
    [
      'bunx',
      '--bun',
      'lighthouse@12',
      `${base}${path}`,
      '--quiet',
      '--only-categories=performance,seo,accessibility,best-practices',
      '--chrome-flags=--headless=new --use-mock-keychain --password-store=basic',
      '--output=json',
      `--output-path=${out}`,
    ],
    {
      env: { ...process.env, CHROME_PATH: CHROME },
      stdout: 'ignore',
      stderr: 'pipe',
    }
  )
  if ((await proc.exited) !== 0)
    throw new Error(
      `${path} run ${i}: ${await new Response(proc.stderr).text()}`
    )
  return JSON.parse(readFileSync(out, 'utf8')) as Report
}

let failed = false
let untrusted = false
for (const path of paths) {
  const reports: Array<Report> = []
  for (let i = 0; i < RUNS; i++) reports.push(await run(path, i))
  if (!Array.isArrayNonEmpty(reports)) throw new Error(`${path}: no runs`)
  const best = Array.max(
    reports,
    Order.mapInput(Order.Number, score('performance'))
  )
  const bench = Math.round(best.environment.benchmarkIndex)
  const trusted = bench >= MIN_BENCHMARK
  if (!trusted) untrusted = true
  const cells = Array.map(BUDGETS, (b) => {
    const v = b.read(best)
    const judged = trusted || !TIMING.has(b.key)
    if (judged && !b.ok(v)) failed = true
    return `${b.key}=${b.show(v)}${!judged ? '?' : b.ok(v) ? '' : '!'}`
  })
  console.log(`${path.padEnd(48)} ${cells.join('  ')}  bench=${bench}`)
}
console.log(
  `reports in ${outDir}; "!" marks a budget breach, "?" a timing metric not judged (bench < ${MIN_BENCHMARK})`
)
process.exit(failed ? 1 : untrusted ? 2 : 0)
