import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { Array, Option, Order, pipe, Record, String } from 'effect'

const ORIGIN = 'https://withlily.app'
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
}
const decodeEntities = (s: string) =>
  s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) =>
    name.startsWith('#x') || name.startsWith('#X')
      ? globalThis.String.fromCodePoint(Number.parseInt(name.slice(2), 16))
      : name.startsWith('#')
        ? globalThis.String.fromCodePoint(Number(name.slice(1)))
        : (ENTITIES[name] ?? entity)
  )

interface Page {
  readonly url: string
  readonly title: string
  readonly description: string
  readonly canonical: string
  readonly hreflang: Record<string, string>
  readonly ogUrl: string
  readonly ogLocale: string
  readonly robots: string
  readonly jsonLd: ReadonlyArray<string>
  readonly h1: number
}

const IGNORED = /^(404|_not-found|google[0-9a-f]+)\.html$/

const walk = (dir: string): ReadonlyArray<string> =>
  Array.flatMap(readdirSync(dir), (name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

const urlOf = (root: string, file: string): string =>
  pipe(
    relative(root, file),
    String.replace(/(^|\/)index\.html$/, ''),
    String.replace(/\.html$/, ''),
    (path) => `${ORIGIN}/${path}`.replace(/\/$/, '') || ORIGIN
  )

const jsonLdTypes = (raw: string): ReadonlyArray<string> => {
  const node = JSON.parse(raw) as {
    '@type'?: string
    '@graph'?: Array<{ '@type': string }>
  }
  return node['@graph']
    ? Array.map(node['@graph'], (n) => n['@type'])
    : node['@type']
      ? [node['@type']]
      : []
}

const parse = async (url: string, html: string): Promise<Page> => {
  const page = {
    url,
    title: '',
    description: '',
    canonical: '',
    hreflang: {} as Record<string, string>,
    ogUrl: '',
    ogLocale: '',
    robots: '',
    jsonLd: [] as string[],
    h1: 0,
  }
  let inTitle = false
  let ld = ''
  await new HTMLRewriter()
    .on('head title', {
      element: (el) => {
        inTitle = true
        page.title = ''
        el.onEndTag(() => {
          inTitle = false
        })
      },
      text: (t) => {
        if (inTitle) page.title += t.text
      },
    })
    .on('meta', {
      element: (el) => {
        const key = el.getAttribute('name') ?? el.getAttribute('property')
        const content = el.getAttribute('content') ?? ''
        if (key === 'description') page.description = content
        if (key === 'og:url') page.ogUrl = content
        if (key === 'og:locale') page.ogLocale = content
        if (key === 'robots') page.robots = content
      },
    })
    .on('link[rel="canonical"]', {
      element: (el) => {
        page.canonical = el.getAttribute('href') ?? ''
      },
    })
    .on('link[rel="alternate"][hreflang]', {
      element: (el) => {
        page.hreflang[el.getAttribute('hreflang') ?? ''] =
          el.getAttribute('href') ?? ''
      },
    })
    .on('script[type="application/ld+json"]', {
      element: (el) => {
        ld = ''
        el.onEndTag(() => {
          page.jsonLd.push(...jsonLdTypes(ld))
        })
      },
      text: (t) => {
        ld += t.text
      },
    })
    .on('h1', {
      element: () => {
        page.h1++
      },
    })
    .transform(new Response(html))
    .text()
  page.title = decodeEntities(page.title).trim()
  page.description = decodeEntities(page.description)
  page.jsonLd.sort()
  return {
    ...page,
    hreflang: Record.fromEntries(
      Array.sort(
        Record.toEntries(page.hreflang),
        Order.mapInput(Order.String, ([k]: readonly [string, string]) => k)
      )
    ),
  }
}

const load = async (root: string) => {
  const files = pipe(
    walk(root),
    Array.filter((f) => f.endsWith('.html') && !IGNORED.test(relative(root, f)))
  )
  const pages = await Promise.all(
    Array.map(files, (f) => parse(urlOf(root, f), readFileSync(f, 'utf8')))
  )
  const sitemap = pipe(
    readFileSync(join(root, 'sitemap.xml'), 'utf8').matchAll(
      /<loc>([^<]+)<\/loc>/g
    ),
    (it) => Array.map(Array.fromIterable(it), (m) => m[1] ?? '')
  )
  return {
    pages: Record.fromIterableWith(pages, (p) => [p.url, p] as const),
    sitemap,
  }
}

const isIndexable = (p: Page) => !String.includes('noindex')(p.robots)

const lint = (pages: Record<string, Page>, sitemap: ReadonlyArray<string>) => {
  const errors: string[] = []
  const warnings: string[] = []
  for (const p of Record.values(pages)) {
    if (!p.title) errors.push(`${p.url} missing <title>`)
    if (!isIndexable(p)) continue
    if (!p.description) errors.push(`${p.url} missing description`)
    if (p.canonical !== p.url)
      errors.push(`${p.url} canonical is ${p.canonical || 'missing'}`)
    if (p.ogUrl !== p.url)
      errors.push(`${p.url} og:url is ${p.ogUrl || 'missing'}`)
    for (const l of ['en', 'fr', 'x-default'])
      if (!p.hreflang[l]) errors.push(`${p.url} missing hreflang ${l}`)
    if (p.h1 !== 1) errors.push(`${p.url} has ${p.h1} h1`)
    if (!Array.contains(sitemap, p.url))
      errors.push(`${p.url} indexable but not in sitemap`)
    if (p.title.length > 60)
      warnings.push(`${p.url} title ${p.title.length} chars`)
    const d = p.description.length
    if (d < 120 || d > 160) warnings.push(`${p.url} description ${d} chars`)
  }
  for (const u of sitemap)
    if (!pages[u]) errors.push(`sitemap lists ${u} but no page exists`)
  return { errors, warnings }
}

const STRUCTURAL = [
  'canonical',
  'hreflang',
  'ogUrl',
  'ogLocale',
  'robots',
  'jsonLd',
] as const
const COPY = ['title', 'description'] as const

const diff = (
  base: Record<string, Page>,
  next: Record<string, Page>,
  baseMap: ReadonlyArray<string>,
  nextMap: ReadonlyArray<string>
) => {
  const errors: string[] = []
  const copy: string[] = []
  const sorted = (xs: Iterable<string>) =>
    Array.sort(Array.fromIterable(xs), Order.String)
  for (const u of sorted(Record.keys(base)))
    if (!next[u]) errors.push(`missing page ${u}`)
  for (const u of sorted(Record.keys(next)))
    if (!base[u]) errors.push(`new page ${u}`)
  for (const u of sorted(baseMap))
    if (!Array.contains(nextMap, u)) errors.push(`sitemap dropped ${u}`)
  for (const u of sorted(nextMap))
    if (!Array.contains(baseMap, u)) errors.push(`sitemap added ${u}`)
  for (const u of sorted(Record.keys(base))) {
    const a = base[u]
    const b = next[u]
    if (!a || !b) continue
    for (const k of STRUCTURAL) {
      const [x, y] = [JSON.stringify(a[k]), JSON.stringify(b[k])]
      if (x !== y) errors.push(`${u} ${k}: ${x} -> ${y}`)
    }
    for (const k of COPY)
      if (a[k] !== b[k])
        copy.push(
          `${u} ${k}: ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`
        )
  }
  return { errors, copy }
}

const args = process.argv.slice(2)
const dir = Option.getOrElse(Array.head(args), () => 'dist/client')
const baseIdx = args.indexOf('--baseline')
const verbose = Array.contains(args, '--verbose')

const site = await load(dir)
const { errors, warnings } = lint(site.pages, site.sitemap)
console.log(
  `[seo-check] ${Record.size(site.pages)} pages, ${site.sitemap.length} sitemap urls in ${dir}`
)
console.log(
  `[seo-check] lint: ${errors.length} errors, ${warnings.length} length warnings`
)
for (const e of errors) console.log(`  error ${e}`)
if (verbose) for (const w of warnings) console.log(`  warn  ${w}`)

let failed = errors.length > 0
if (baseIdx >= 0) {
  const basePath = args[baseIdx + 1] ?? ''
  const base = await load(basePath)
  const d = diff(base.pages, site.pages, base.sitemap, site.sitemap)
  console.log(
    `[seo-check] parity vs ${basePath}: ${d.errors.length} structural diffs, ${d.copy.length} copy changes`
  )
  for (const e of d.errors.slice(0, 200)) console.log(`  diff ${e}`)
  if (verbose) for (const c of d.copy) console.log(`  copy ${c}`)
  failed ||= d.errors.length > 0
}
process.exit(failed ? 1 : 0)
