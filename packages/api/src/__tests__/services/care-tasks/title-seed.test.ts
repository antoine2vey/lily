import { titleSeedOf } from '@lily/api/services/care-tasks/helpers/group-tasks'
import { DateTime } from 'effect'
import { describe, expect, it } from 'vitest'

const seedAt = (iso: string) =>
  titleSeedOf('Europe/Paris', DateTime.makeUnsafe(iso))

describe('titleSeedOf', () => {
  it('changes at local midnight', () => {
    expect(seedAt('2026-11-12T23:30:00Z')).toBe(
      seedAt('2026-11-12T22:59:00Z') + 1
    )
  })

  it('holds across UTC midnight', () => {
    expect(seedAt('2026-11-13T00:30:00Z')).toBe(seedAt('2026-11-12T23:30:00Z'))
  })
})
