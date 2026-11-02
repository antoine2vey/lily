import type { CanopyInvitationRow } from '@lily/api/repositories/canopy.repository'
import type { CanopyInvitationView } from '@lily/shared'
import { DateTime } from 'effect'

const DECLINE_COOLDOWN_DAYS = 7

type InvitationState = Pick<
  CanopyInvitationRow,
  'status' | 'expiresAt' | 'resolvedAt'
>

export const statusAt = (
  invitation: InvitationState,
  now: DateTime.Utc
): CanopyInvitationView['status'] =>
  invitation.status === 'pending' &&
  DateTime.isLessThanOrEqualTo(DateTime.makeUnsafe(invitation.expiresAt), now)
    ? 'expired'
    : invitation.status

export type Admission = 'open' | 'expired' | 'spent' | 'gone'

const ADMISSION = {
  pending: 'open',
  expired: 'expired',
  accepted: 'spent',
  declined: 'gone',
  withdrawn: 'gone',
} as const satisfies Record<CanopyInvitationView['status'], Admission>

export const admissionOf = (
  invitation: InvitationState,
  now: DateTime.Utc
): Admission => ADMISSION[statusAt(invitation, now)]

export const planInvitation = (
  existing: InvitationState | null,
  now: DateTime.Utc
): 'send' | 'alreadyOpen' | 'declinedRecently' => {
  if (existing === null) return 'send'
  if (admissionOf(existing, now) === 'open') return 'alreadyOpen'
  return existing.status === 'declined' &&
    existing.resolvedAt !== null &&
    DateTime.isLessThan(
      now,
      DateTime.add(DateTime.makeUnsafe(existing.resolvedAt), {
        days: DECLINE_COOLDOWN_DAYS,
      })
    )
    ? 'declinedRecently'
    : 'send'
}
