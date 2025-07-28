import { Effect } from 'effect'
import { getNotifications } from './endpoints/get-notifications'
import { markNotificationRead } from './endpoints/mark-notification-read'

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
