import { isDriftPassDue } from '@lily/api/services/reminders-audit/scheduler'
import { DateTime, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const at = (iso: string) => DateTime.makeUnsafe(iso)

describe('isDriftPassDue', () => {
  it('waits for 03:00 UTC', () => {
    expect(isDriftPassDue(at('2026-11-13T02:59:00Z'), Option.none())).toBe(
      false
    )
  })

  it('runs on the first tick at or after 03:00 UTC', () => {
    expect(isDriftPassDue(at('2026-11-13T03:00:00Z'), Option.none())).toBe(true)
  })

  it('runs once a day', () => {
    expect(
      isDriftPassDue(at('2026-11-13T09:00:00Z'), Option.some('2026-11-13'))
    ).toBe(false)
  })

  it('runs when the tick after 02:59 lands past 04:00', () => {
    expect(
      isDriftPassDue(at('2026-11-13T04:01:00Z'), Option.some('2026-11-12'))
    ).toBe(true)
  })
})
