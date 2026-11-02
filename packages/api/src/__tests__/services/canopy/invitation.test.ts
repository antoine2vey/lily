import {
  admissionOf,
  planInvitation,
} from '@lily/api/services/canopy/helpers/invitation'
import type { CanopyInvitationStatus } from '@lily/shared'
import { DateTime } from 'effect'
import { describe, expect, it } from 'vitest'

const now = DateTime.makeUnsafe('2026-11-02T12:00:00Z')
const at = (iso: string) => new Date(iso)

const row = (
  status: CanopyInvitationStatus,
  expiresAt: string,
  resolvedAt: string | null = null
) => ({
  status,
  expiresAt: at(expiresAt),
  resolvedAt: resolvedAt === null ? null : at(resolvedAt),
})

describe('admissionOf', () => {
  it.each([
    ['pending', '2026-11-03T00:00:00Z', 'open'],
    ['pending', '2026-11-02T12:00:00Z', 'expired'],
    ['pending', '2026-11-01T00:00:00Z', 'expired'],
    ['accepted', '2026-11-03T00:00:00Z', 'spent'],
    ['accepted', '2026-11-01T00:00:00Z', 'spent'],
    ['declined', '2026-11-03T00:00:00Z', 'gone'],
    ['withdrawn', '2026-11-03T00:00:00Z', 'gone'],
  ] as const)('%s, expiring %s, is %s', (status, expiresAt, admission) => {
    expect(admissionOf(row(status, expiresAt), now)).toBe(admission)
  })
})

describe('planInvitation', () => {
  it('sends a first invitation', () => {
    expect(planInvitation(null, now)).toBe('send')
  })

  it('stays quiet while an invitation is open', () => {
    expect(planInvitation(row('pending', '2026-11-05T00:00:00Z'), now)).toBe(
      'alreadyOpen'
    )
  })

  it('sends again once the open invitation lapsed', () => {
    expect(planInvitation(row('pending', '2026-11-01T00:00:00Z'), now)).toBe(
      'send'
    )
  })

  it('stays quiet for a week after a decline, then sends', () => {
    const declinedOn = (iso: string) =>
      row('declined', '2026-11-09T00:00:00Z', iso)

    expect(planInvitation(declinedOn('2026-10-27T00:00:00Z'), now)).toBe(
      'declinedRecently'
    )
    expect(planInvitation(declinedOn('2026-10-26T12:00:00Z'), now)).toBe('send')
  })

  it.each(['accepted', 'withdrawn'] as const)(
    'sends again after a %s invitation',
    (status) => {
      expect(
        planInvitation(
          row(status, '2026-11-05T00:00:00Z', '2026-11-01T00:00:00Z'),
          now
        )
      ).toBe('send')
    }
  )
})
