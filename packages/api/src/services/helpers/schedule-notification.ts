import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type {
  SimpleNotificationParams,
  SimpleNotificationType,
} from '@lily/api/services/notification-scheduler/translations'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import type { LanguageCode } from '@lily/shared'
import { nowAsDate } from '@lily/shared'
import { Effect } from 'effect'

/**
 * Build translated content and create a notification in a single step.
 * Centralizes the repeated pattern of buildSimpleContent + notificationRepo.create.
 */
export const scheduleNotification = (
  type: SimpleNotificationType,
  userId: string,
  params: SimpleNotificationParams,
  language: LanguageCode
) =>
  Effect.gen(function* () {
    const notificationRepo = yield* NotificationRepository
    const { title, body } = buildSimpleContent(type, params, language)

    yield* notificationRepo.create({
      userId,
      type,
      title,
      body,
      scheduledAt: nowAsDate(),
    })
  })
