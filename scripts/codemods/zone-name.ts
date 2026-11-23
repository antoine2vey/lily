// Usage:
//   bun scripts/codemods/zone-name.ts rename <file...>
//   bun scripts/codemods/zone-name.ts retype <file...>
//   bun scripts/codemods/zone-name.ts props <file...>
//   bun run tsc 2>&1 | bun scripts/codemods/zone-name.ts wrap
// rename: the old TimeZone schema and DEFAULT_TIMEZONE become ZoneName and
// DEFAULT_ZONE. Effect's DateTime.TimeZone stays as it is.
// retype: every `timezone`, `careTimezone` or `newTimezone` field or parameter
// declared as a string becomes a ZoneName, nullable or optional as before.
// props: wraps each canonical zone literal given to a `timezone` or
// `careTimezone` property in ZoneName.make, for fixtures and inserts.
// wrap: reads tsc output and wraps each canonical zone literal that tsc
// reports as not assignable to ZoneName in ZoneName.make, adding the import.
// It prints every other reported site, such as a variable or an alias, for a
// hand fix. Running either pass again changes nothing.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { CANONICAL_TIME_ZONES } from '../../packages/shared/src/domains/notification/time-zones.generated'

const canonical: ReadonlySet<string> = new Set(CANONICAL_TIME_ZONES)
const root = resolve(dirname(new URL(import.meta.url).pathname), '../..')

const rename = (files: ReadonlyArray<string>) => {
  for (const file of files) {
    const before = readFileSync(file, 'utf8')
    const after = before
      .replace(/(?<![.\w])TimeZone(?!\w)/g, 'ZoneName')
      .replace(/\bDEFAULT_TIMEZONE\b/g, 'DEFAULT_ZONE')
      .replace(/identifier: 'TimeZone'/g, "identifier: 'ZoneName'")
    if (after !== before) writeFileSync(file, after)
  }
}

const addImport = (source: string, file: string): string => {
  if (
    /\bZoneName\b[^\n]*from '@lily\/shared'|import \{[^}]*\bZoneName\b/s.test(
      source
    )
  )
    return source
  const fromShared = source.match(/import \{([^}]*)\} from '@lily\/shared'\n/)
  if (fromShared && !file.includes('/packages/shared/'))
    return source.replace(
      fromShared[0],
      `import {${fromShared[1].replace(/,?\s*$/, '')}, ZoneName } from '@lily/shared'\n`
    )
  const specifier = file.includes('/packages/shared/src/__tests__/')
    ? '../domains/common/date/zone-name'
    : '@lily/shared'
  return `import { ZoneName } from '${specifier}'\n${source}`
}

const retype = (files: ReadonlyArray<string>) => {
  for (const file of files) {
    const before = readFileSync(file, 'utf8')
    const after = before.replace(
      /\b(timezone|careTimezone|newTimezone)(\??): string\b/g,
      '$1$2: ZoneName'
    )
    if (after !== before) writeFileSync(file, addImport(after, file))
  }
}

const props = (files: ReadonlyArray<string>) => {
  for (const file of files) {
    const before = readFileSync(file, 'utf8')
    const after = before.replace(
      /\b(timezone|careTimezone)(\??:\s*)(['"])([^'"]+)\3/g,
      (whole, key, sep, quote, zone) =>
        canonical.has(zone)
          ? `${key}${sep}ZoneName.make(${quote}${zone}${quote})`
          : whole
    )
    if (after !== before) writeFileSync(file, addImport(after, file))
  }
}

const wrap = (tscOutput: string) => {
  const site =
    /^(?:@lily\/([\w-]+)[: ]tsc: )?(\S+?)\((\d+),(\d+)\): error TS2\d+: .*Brand<"ZoneName">/gm
  const byFile = new Map<string, Array<[number, number]>>()
  for (const [, pkg, path, line, col] of tscOutput.matchAll(site)) {
    const file = pkg ? join(root, 'packages', pkg, path) : join(root, path)
    const sites = byFile.get(file) ?? []
    sites.push([Number(line), Number(col)])
    byFile.set(file, sites)
  }
  for (const [file, sites] of byFile) {
    const lines = readFileSync(file, 'utf8').split('\n')
    let changed = false
    for (const [line, col] of sites.sort((a, b) => b[1] - a[1])) {
      const text = lines[line - 1]
      const rest = text.slice(col - 1)
      const literal = rest.match(/^(['"])([^'"]+)\1/)
      if (literal && canonical.has(literal[2])) {
        lines[line - 1] =
          text.slice(0, col - 1) +
          `ZoneName.make(${literal[0]})` +
          rest.slice(literal[0].length)
        changed = true
      } else {
        console.log(`${file}:${line}:${col}: ${text.trim()}`)
      }
    }
    if (changed) writeFileSync(file, addImport(lines.join('\n'), file))
  }
}

const [mode, ...files] = process.argv.slice(2)
if (mode === 'rename') rename(files)
else if (mode === 'retype') retype(files)
else if (mode === 'props') props(files)
else if (mode === 'wrap') wrap(readFileSync(0, 'utf8'))
else {
  console.error('usage: zone-name.ts rename|retype|props <file...> | wrap < tsc-output')
  process.exit(2)
}
