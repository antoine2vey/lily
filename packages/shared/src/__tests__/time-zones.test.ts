import { spawnSync } from 'node:child_process'
import { Array, Record } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  CANONICAL_TIME_ZONES,
  TIME_ZONE_ALIASES,
} from '../domains/notification/time-zones.generated'

const covered: ReadonlySet<string> = new Set([
  ...CANONICAL_TIME_ZONES,
  ...Record.keys(TIME_ZONE_ALIASES),
])

const PROBE = `
const resolves = (timeZone) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}
const canonical = JSON.parse(process.argv.at(-1))
console.log(JSON.stringify({
  listed: Intl.supportedValuesOf('timeZone'),
  unresolved: canonical.filter((zone) => !resolves(zone)),
}))
`

const probe = (binary: string) => {
  const result = spawnSync(
    binary,
    ['-e', PROBE, JSON.stringify(CANONICAL_TIME_ZONES)],
    { encoding: 'utf8' }
  )
  expect(result.status, result.stderr).toBe(0)
  const parsed: {
    readonly listed: ReadonlyArray<string>
    readonly unresolved: ReadonlyArray<string>
  } = JSON.parse(result.stdout)
  return parsed
}

describe('generated time zone table', () => {
  it('maps every alias to a canonical zone and never to another alias', () => {
    const canonical: ReadonlySet<string> = new Set(CANONICAL_TIME_ZONES)

    expect(
      Array.filter(
        Record.toEntries(TIME_ZONE_ALIASES),
        ([alias, zone]) => canonical.has(alias) || !canonical.has(zone)
      )
    ).toEqual([])
  })

  describe.each([
    ['Node', process.execPath],
    ['Bun', 'bun'],
  ])('%s', (_runtime, binary) => {
    const { listed, unresolved } = probe(binary)

    it('lists no zone the table leaves out', () => {
      expect(Array.filter(listed, (zone) => !covered.has(zone))).toEqual([])
    })

    it('resolves every canonical zone', () => {
      expect(unresolved).toEqual([])
    })
  })
})
