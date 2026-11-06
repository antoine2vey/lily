import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Array, Option, pipe, Record, Schema, String } from 'effect'
import matter from 'gray-matter'
import { CATEGORIES } from '../src/lib/posts'

// usage: bun scripts/blog-check.ts [--strict] [--only a,b] [--hubs plan.json] [--map out]
// Default mode fails on structure (slugs, dates, parity, links, redirects).
// --strict also fails on the editorial rules in docs/seo/strategy.md.
// --only scopes per-post checks to some slugs while other posts are mid-rewrite;
// --hubs makes the planned slug list the only valid link targets.

const CONTENT = join(import.meta.dirname, '..', 'content', 'posts')
const LOCALES = ['en', 'fr'] as const
type Locale = (typeof LOCALES)[number]

const TITLE_MAX = 53
const DESCRIPTION = { min: 120, max: 160 }
const BANNED: Record<Locale, ReadonlyArray<RegExp>> = {
  en: [
    /\bensur(e|es|ing)\b/i,
    /\bthriv(e|es|ing)\b/i,
    /\bcrucial\b/i,
    /\bvibrant\b/i,
    /\blush\b/i,
    /\bdelv(e|ing)\b/i,
    /\bembark\b/i,
    /\belevate\b/i,
    /\bunlock\b/i,
    /\bjourney\b/i,
    /\btestament\b/i,
    /\btapestry\b/i,
    /\bnestled\b/i,
    /\bseamless(ly)?\b/i,
    /\bplethora\b/i,
    /\bmyriad\b/i,
    /\bgame[- ]changer\b/i,
    /\bwhether you'?re\b/i,
    /\bhappy (gardening|growing|planting)\b/i,
    /\bin conclusion\b/i,
    /^#+ *(conclusion|final thoughts)\b/im,
  ],
  fr: [
    /\bcrucia(l|le|ux)\b/i,
    /\bluxuriant(e|es|s)?\b/i,
    /\bn['’]hésitez pas\b/i,
    /\ben conclusion\b/i,
    /\ben somme\b/i,
    /\bplongeons\b/i,
    /\bdécouvrons\b/i,
    /\bvéritable\b/i,
    /\bbon jardinage\b/i,
    /^#+ *(conclusion|le mot de la fin)\b/im,
  ],
}
const BANNED_HOSTS = /example\.com|lilyblog/i
const MOJIBAKE = /Ã|Â|â€|�/
const ENGLISH = new Set(
  String.split(
    'the and your with is are this that you when what how from will should can its they them their these those which while into about pests leaves watering',
    ' '
  )
)
const ENGLISH_MAX = 0.005
const FR_SPACING = [
  / [?!:;](?=\s|$)/m,
  /« | »/,
  /\d (%|°C|°F|cm|mm|m²|m³|m|h|min|L|mL|ml|kg|g|lux)(?![\p{L}\d'’])/u,
  /(?<![\d,.])\d{1,3} \d{3}(?!\d)/,
]

const Frontmatter = Schema.Struct({
  title: Schema.String,
  description: Schema.String,
  date: Schema.String,
  updated: Schema.optional(Schema.String),
  slug: Schema.String,
  category: Schema.String,
  tags: Schema.Array(Schema.String),
  redirectFrom: Schema.optional(Schema.Array(Schema.String)),
})
type Frontmatter = typeof Frontmatter.Type

interface Post {
  readonly locale: Locale
  readonly file: string
  readonly slug: string
  readonly meta: Frontmatter
  readonly body: string
}

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const option = (name: string) =>
  pipe(
    Array.findFirstIndex(args, (a) => a === name),
    Option.flatMap((i) => Array.get(args, i + 1))
  )

const strict = flag('--strict')
const only = pipe(
  option('--only'),
  Option.map((s) => new Set(String.split(s, ','))),
  Option.getOrUndefined
)
const planned = pipe(
  option('--hubs'),
  Option.map(
    (file) =>
      new Set(
        Array.map(
          JSON.parse(readFileSync(file, 'utf8')) as ReadonlyArray<{
            slug: string
          }>,
          (h) => h.slug
        )
      )
  ),
  Option.getOrUndefined
)

const errors: string[] = []
const warnings: string[] = []
const fail = (post: Post | string, message: string, editorial = false) => {
  const where = typeof post === 'string' ? post : `${post.locale}/${post.file}`
  const line = `${where}: ${message}`
  if (editorial && !strict) warnings.push(line)
  else errors.push(line)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const decode = Schema.decodeUnknownOption(Frontmatter)

const load = (locale: Locale): ReadonlyArray<Post> =>
  Array.flatMap(readdirSync(join(CONTENT, locale)), (file) => {
    if (!file.endsWith('.mdx')) return []
    const { data, content } = matter(
      readFileSync(join(CONTENT, locale, file), 'utf8')
    )
    return Option.match(decode(data), {
      onNone: () => {
        fail(`${locale}/${file}`, 'frontmatter does not match the schema')
        return []
      },
      onSome: (meta) => [
        { locale, file, slug: file.replace(/\.mdx$/, ''), meta, body: content },
      ],
    })
  })

const posts = { en: load('en'), fr: load('fr') }
const live = Record.map(
  posts,
  (list) => new Set(Array.map(list, (p) => p.slug))
)

const redirects = Record.map(posts, (list) =>
  Array.flatMap(list, (p) =>
    Array.map(p.meta.redirectFrom ?? [], (from) => [from, p] as const)
  )
)
const redirected = Record.map(
  redirects,
  (pairs) => new Set(Array.map(pairs, ([from]) => from))
)

const visible = (slug: string) => !only || only.has(slug)

for (const locale of LOCALES) {
  const other = locale === 'en' ? 'fr' : 'en'
  for (const slug of live[locale])
    if (visible(slug) && !live[other].has(slug))
      fail(`${locale}/${slug}.mdx`, `has no ${other} counterpart`)

  const claimed = new Map<string, string>()
  for (const [from, post] of redirects[locale]) {
    if (visible(post.slug) && live[locale].has(from))
      fail(post, `redirectFrom "${from}" is still a live post`)
    const previous = claimed.get(from)
    if (previous)
      fail(post, `redirectFrom "${from}" is also claimed by ${previous}`)
    claimed.set(from, post.slug)
  }
}

const LINK = /\]\(([^)\s]+)\)|href="([^"]+)"/g
const PROSE = (body: string) =>
  body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '')

for (const post of Array.flatten(Record.values(posts))) {
  const { meta, locale, slug, body } = post
  if (!visible(slug)) continue
  if (meta.slug !== slug)
    fail(post, `frontmatter slug "${meta.slug}" ≠ filename`)
  if (!ISO_DATE.test(meta.date)) fail(post, `date "${meta.date}" is not ISO`)
  if (meta.updated !== undefined) {
    if (!ISO_DATE.test(meta.updated))
      fail(post, `updated "${meta.updated}" is not ISO`)
    else if (meta.updated < meta.date) fail(post, 'updated is before date')
  }
  if (BANNED_HOSTS.test(body)) fail(post, 'links to a placeholder host')
  if (MOJIBAKE.test(`${meta.title}\n${meta.description}\n${body}`))
    fail(post, 'has mis-encoded characters (UTF-8 read as Latin-1)')

  for (const match of body.matchAll(LINK)) {
    const href = match[1] ?? match[2] ?? ''
    const blog = /^\/(?<target>en|fr)\/blog\/(?<linked>[^/?#]+)/.exec(href)
    if (/^\/blog\//.test(href)) fail(post, `link ${href} has no locale`)
    const { target, linked } = blog?.groups ?? {}
    if (target === undefined || linked === undefined) continue
    if (target !== locale) fail(post, `link ${href} crosses locale`)
    else if (redirected[locale].has(linked))
      fail(post, `link ${href} points at a redirected slug`)
    else if (!(planned ?? live[locale]).has(linked))
      fail(post, `link ${href} is broken`)
  }

  const editorial = (message: string) => fail(post, message, true)
  if (meta.title.length > TITLE_MAX)
    editorial(`title ${meta.title.length} chars > ${TITLE_MAX}`)
  const d = meta.description.length
  if (d < DESCRIPTION.min || d > DESCRIPTION.max)
    editorial(
      `description ${d} chars, want ${DESCRIPTION.min}-${DESCRIPTION.max}`
    )
  if (!Array.contains(CATEGORIES, meta.category))
    editorial(`category "${meta.category}" not in ${CATEGORIES.join(', ')}`)
  if (meta.updated === undefined) editorial('missing updated')
  const prose = PROSE(body)
  if (/—/.test(prose) || /—/.test(meta.title + meta.description))
    editorial('uses an em dash')
  for (const re of BANNED[locale]) {
    const hit = re.exec(prose) ?? re.exec(`${meta.title}\n${meta.description}`)
    if (hit) editorial(`banned phrase "${hit[0].trim()}"`)
  }
  if (locale === 'fr') {
    const words = (s: string) =>
      Array.filter(
        String.split(s.toLowerCase().replace(/\]\([^)]*\)/g, ']'), /[^a-z'’]+/),
        (w) => w.length > 0
      )
    const english = (s: string) => Array.filter(words(s), (w) => ENGLISH.has(w))
    const head = english(`${meta.title} ${meta.description}`)
    if (head.length > 0)
      editorial(`English in French title or description: ${head.join(', ')}`)
    const body = words(prose)
    const ratio = english(prose).length / Math.max(1, body.length)
    if (ratio > ENGLISH_MAX)
      editorial(`French body is ${(ratio * 100).toFixed(1)}% English words`)
    const twin = Array.findFirst(posts.en, (p) => p.slug === slug)
    if (Option.isSome(twin) && twin.value.meta.title === meta.title)
      editorial('French title is identical to the English one')
    const text = `${meta.title}\n${meta.description}\n${prose}`
    const hit = FR_SPACING.map((re) => re.exec(text)).find((m) => m !== null)
    if (hit) editorial(`regular space in "${hit[0]}" (use U+00A0)`)
  }
}

pipe(
  option('--map'),
  Option.map((out) =>
    writeFileSync(
      out,
      pipe(
        LOCALES,
        Array.flatMap((locale) =>
          Array.map(
            redirects[locale],
            ([from, post]) =>
              `/${locale}/blog/${from} /${locale}/blog/${post.slug};`
          )
        ),
        Array.join('\n'),
        (lines) => `${lines}\n`
      )
    )
  )
)

const count = Record.map(posts, (list) => list.length)
console.log(
  `[blog-check] ${count.en} en / ${count.fr} fr posts, ${redirects.en.length + redirects.fr.length} redirects, ${errors.length} errors, ${warnings.length} editorial warnings`
)
for (const e of errors) console.log(`  error ${e}`)
if (flag('--verbose')) for (const w of warnings) console.log(`  warn  ${w}`)
if (errors.length > 0) process.exit(1)
