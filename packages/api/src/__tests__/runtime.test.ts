import { DateTime, Option } from 'effect'
import { describe, expect, it } from 'vitest'

describe('The runtime the api tests run on', () => {
  it('is Bun, the runtime production runs on', () => {
    expect(process.versions.bun).toBeDefined()
  })

  it.each(['GMT', 'GMT0', 'Etc/GMT'])(
    'keeps the stored zone name %s instead of canonicalizing it to UTC',
    (zone) => {
      expect(
        Option.map(DateTime.zoneMakeNamed(zone), (found) => found.id)
      ).toEqual(Option.some(zone))
    }
  )
})
