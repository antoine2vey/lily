import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(import.meta.dirname, '../..')

const walk = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return name === '__tests__' ? [] : walk(path)
    }
    return path.endsWith('.ts') ? [path] : []
  })

const ZONE_FUNCTIONS = [
  /AT\s+TIME\s+ZONE\s+(?!'UTC')/gi,
  /(?<![\w.])timezone\s*\(/gi,
  /make_timestamptz\s*\(/gi,
  /SET\s+(?:LOCAL\s+)?TIME\s+ZONE/gi,
]

describe('SQL time zone math', () => {
  it('runs in UTC only, so a stored zone never reaches Postgres', () => {
    const uses = walk(SRC).flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return ZONE_FUNCTIONS.flatMap((pattern) =>
        Array.from(
          source.matchAll(pattern),
          (match) => `${relative(SRC, file)}: ${match[0]}`
        )
      )
    })

    expect(uses).toEqual([])
  })
})
