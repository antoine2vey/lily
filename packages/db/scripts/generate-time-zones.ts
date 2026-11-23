#!/usr/bin/env bun
/**
 * Writes packages/shared/src/domains/notification/time-zones.generated.ts
 * from a pinned IANA tzdata release. With --sql it also prints the alias map
 * as SQL VALUES rows, the form drizzle/0089_canonical_time_zones.sql embeds.
 *
 * bun run --filter=@lily/db generate:time-zones [-- --sql]
 */

import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Array, Option, Order, pipe, Record, String } from 'effect'

const TZDATA_VERSION = '2026f'
const TZDATA_URL = `https://data.iana.org/time-zones/releases/tzdata${TZDATA_VERSION}.tar.gz`
const TZDATA_SHA256 =
  '01b4a91cec5167ed48c11e8ab78f2048cead78ce94b0cafcad0ae8c5a3044d3d'

const SOURCE_FILES = [
  'africa',
  'antarctica',
  'asia',
  'australasia',
  'europe',
  'northamerica',
  'southamerica',
  'etcetera',
  'backward',
] as const

const COUNTRY_FILE = 'zone.tab'

// tzdata names Etc/UTC the zone and UTC a link. Lily keeps UTC canonical,
// because it is the column default and the zone CLDR and Intl report.
const RENAMED_ZONES: { readonly [zone: string]: string } = {
  'Etc/UTC': 'UTC',
}

const OUTPUT = resolve(
  import.meta.dir,
  '../../shared/src/domains/notification/time-zones.generated.ts'
)

type Entry =
  | { readonly kind: 'zone'; readonly name: string }
  | { readonly kind: 'link'; readonly target: string; readonly name: string }

const parseLine = (line: string): ReadonlyArray<Entry> => {
  const fields = pipe(
    line,
    String.split('#'),
    Array.head,
    Option.getOrElse(() => ''),
    String.trim,
    String.split(/\s+/)
  )
  const [keyword, first, second] = fields
  if (keyword === 'Zone' && first !== undefined) {
    return [{ kind: 'zone', name: first }]
  }
  if (keyword === 'Link' && first !== undefined && second !== undefined) {
    return [{ kind: 'link', target: first, name: second }]
  }
  return []
}

const download = async (): Promise<string> => {
  const response = await fetch(TZDATA_URL)
  if (!response.ok) {
    throw new Error(`${TZDATA_URL} answered ${response.status}`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== TZDATA_SHA256) {
    throw new Error(`tzdata sha256 ${digest}, expected ${TZDATA_SHA256}`)
  }
  const dir = await mkdtemp(join(tmpdir(), 'tzdata-'))
  const archive = join(dir, 'tzdata.tar.gz')
  await writeFile(archive, bytes)
  const tar = Bun.spawnSync([
    'tar',
    '-xzf',
    archive,
    '-C',
    dir,
    ...SOURCE_FILES,
    COUNTRY_FILE,
  ])
  if (tar.exitCode !== 0) {
    throw new Error(`tar failed: ${tar.stderr.toString()}`)
  }
  return dir
}

// The Zone lines of `backward` (PST8PDT, EST5EDT, ...) are System V
// compatibility zones that tzdata tells new software not to use, so they are
// not canonical. Each becomes an alias of the US zone that keeps its rules.
const LEGACY_ZONES: { readonly [zone: string]: string } = {
  CST6CDT: 'America/Chicago',
  EST5EDT: 'America/New_York',
  MST7MDT: 'America/Denver',
  PST8PDT: 'America/Los_Angeles',
}

const keepEntry =
  (file: (typeof SOURCE_FILES)[number]) =>
  (entry: Entry): boolean =>
    file !== 'backward' || entry.kind === 'link'

const readEntries = async (dir: string): Promise<ReadonlyArray<Entry>> => {
  const files = await Promise.all(
    Array.map(SOURCE_FILES, async (file) => ({
      file,
      text: await readFile(join(dir, file), 'utf8'),
    }))
  )
  return Array.flatMap(files, ({ file, text }) =>
    pipe(
      String.split(text, '\n'),
      Array.flatMap(parseLine),
      Array.filter(keepEntry(file))
    )
  )
}

// zone.tab lists the zones of each country. tzdata links some of them to
// another country's zone (Europe/Zagreb to Europe/Belgrade), and those stay
// canonical, so no user is moved to a zone named after another country.
const readCountryZones = async (dir: string): Promise<ReadonlyArray<string>> =>
  pipe(
    String.split(await readFile(join(dir, COUNTRY_FILE), 'utf8'), '\n'),
    Array.filter((line) => line !== '' && !String.startsWith('#')(line)),
    Array.flatMap((line) => Array.fromNullishOr(String.split(line, '\t')[2])),
    Array.dedupe,
    Array.sort(Order.String)
  )

const rename = (name: string): string => RENAMED_ZONES[name] ?? name

const build = (
  entries: ReadonlyArray<Entry>,
  countryZones: ReadonlyArray<string>
) => {
  const zones = new Set([
    ...Array.flatMap(entries, (entry) =>
      entry.kind === 'zone' ? [rename(entry.name)] : []
    ),
    ...countryZones,
  ])
  const links = Record.fromEntries(
    Array.flatMap(entries, (entry) =>
      entry.kind === 'link' ? [[entry.name, entry.target] as const] : []
    )
  )
  const resolveTarget = (name: string, seen: ReadonlySet<string>): string => {
    const renamed = rename(name)
    if (zones.has(renamed)) return renamed
    const next = links[name]
    if (next === undefined || seen.has(name)) {
      throw new Error(`link chain from ${name} reaches no zone`)
    }
    return resolveTarget(next, new Set([...seen, name]))
  }
  const aliases = pipe(
    Record.keys(links),
    Array.appendAll(Record.keys(RENAMED_ZONES)),
    Array.appendAll(Record.keys(LEGACY_ZONES)),
    Array.filter((name) => !zones.has(name)),
    Array.dedupe,
    Array.sort(Order.String),
    Array.map(
      (name) =>
        [name, resolveTarget(LEGACY_ZONES[name] ?? name, new Set())] as const
    )
  )
  return {
    canonical: Array.sort([...zones], Order.String),
    aliases,
  }
}

const quote = (value: string): string => `'${value}'`

const renderTs = (
  canonical: ReadonlyArray<string>,
  countryZones: ReadonlyArray<string>,
  aliases: ReadonlyArray<readonly [string, string]>
): string =>
  [
    `// Generated by packages/db/scripts/generate-time-zones.ts from IANA tzdata ${TZDATA_VERSION}. Do not edit.`,
    '',
    `export const TZDATA_VERSION = '${TZDATA_VERSION}'`,
    '',
    'export const CANONICAL_TIME_ZONES = [',
    ...Array.map(canonical, (name) => `  ${quote(name)},`),
    '] as const',
    '',
    'export type CanonicalTimeZoneName = (typeof CANONICAL_TIME_ZONES)[number]',
    '',
    'export const COUNTRY_TIME_ZONES: ReadonlyArray<CanonicalTimeZoneName> = [',
    ...Array.map(countryZones, (name) => `  ${quote(name)},`),
    ']',
    '',
    'export const TIME_ZONE_ALIASES: {',
    '  readonly [alias: string]: CanonicalTimeZoneName',
    '} = {',
    ...Array.map(
      aliases,
      ([alias, target]) => `  ${quote(alias)}: ${quote(target)},`
    ),
    '}',
    '',
  ].join('\n')

const renderSql = (aliases: ReadonlyArray<readonly [string, string]>): string =>
  pipe(
    aliases,
    Array.map(([alias, target]) => `  (${quote(alias)}, ${quote(target)})`),
    Array.join(',\n')
  )

const dir = await download()
try {
  const countryZones = await readCountryZones(dir)
  const { canonical, aliases } = build(await readEntries(dir), countryZones)
  await writeFile(OUTPUT, renderTs(canonical, countryZones, aliases))
  const format = Bun.spawnSync([
    'bunx',
    '--bun',
    'biome',
    'format',
    '--write',
    OUTPUT,
  ])
  if (format.exitCode !== 0) {
    throw new Error(`biome format failed: ${format.stderr.toString()}`)
  }
  console.log(
    `${OUTPUT}: ${canonical.length} canonical zones, ${aliases.length} aliases`
  )
  if (process.argv.includes('--sql')) {
    console.log(renderSql(aliases))
  }
} finally {
  await rm(dir, { recursive: true, force: true })
}
