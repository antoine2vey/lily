import { getNotifications } from '@lily/api/services/notifications/endpoints/get-notifications'
import { markNotificationRead } from '@lily/api/services/notifications/endpoints/mark-notification-read'
import { Effect } from 'effect'

// Notifications service implementation
export class NotificationsService extends Effect.Service<NotificationsService>()(
  'NotificationsService',
  {
    effect: Effect.succeed({
      getNotifications,
      markNotificationRead,
    }),
  }
) {}
