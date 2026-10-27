import type { CanopyMemberRow } from '@lily/api/repositories/canopy.repository'
import { scheduleSimpleNotification } from '@lily/api/services/helpers/schedule-notification'
import type { NotificationParamsMap } from '@lily/api/services/notification-scheduler/translations'
import { Effect, Option } from 'effect'

type CanopyPush =
  | 'canopy_member_joined'
  | 'canopy_member_removed'
  | 'canopy_member_left'

export const senderNameOf = (
  name: string | null | undefined
): { readonly senderName?: string } =>
  Option.match(Option.fromNullishOr(name), {
    onNone: () => ({}),
    onSome: (senderName) => ({ senderName }),
  })

export const notifyMemberBestEffort = <T extends CanopyPush>(
  type: T,
  to: CanopyMemberRow,
  params: NotificationParamsMap[T]
) =>
  scheduleSimpleNotification(type, to.userId, params, to.language).pipe(
    Effect.catchTag('SqlError', (error) =>
      Effect.logWarning('Canopy push not recorded', {
        type,
        userId: to.userId,
        error,
      })
    )
  )
