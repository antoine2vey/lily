import {
  deleteWhere,
  type MockNotificationsOptions,
  type MutableNotification,
  type NotificationTable,
  waiting,
} from '@lily/api/__tests__/mocks/notification-table'
import {
  type INotificationRepository,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import { CARE_TOPICS } from '@lily/shared'
import { Array, Effect, Layer, Option } from 'effect'

export const createMockNotificationRepository = (
  table: NotificationTable,
  options: MockNotificationsOptions = {}
): Layer.Layer<NotificationRepository> => {
  const { rows: notificationsState, queuedAt, deliveryClaims } = table

  const repo: INotificationRepository = {
    create: (data) => {
      const status = data.status ?? 'pending'
      const newNotification: MutableNotification = {
        id: `notification-${crypto.randomUUID()}`,
        type: data.type,
        title: data.title,
        body: data.body,
        params: data.params,
        scheduledAt: data.scheduledAt,
        isRead: false,
        status,
        retryCount: 0,
        userId: data.userId,
        plantId: data.plantId,
        metadata: data.metadata,
        createdAt: new Date(),
      }
      if (status === 'queued') queuedAt.set(newNotification.id, new Date())
      notificationsState.push(newNotification)
      options.onCreate?.(newNotification)
      return Effect.succeed(newNotification)
    },

    deletePendingByUserIdAndTypes: (
      userId: string,
      types: ReadonlyArray<string>
    ) =>
      Effect.sync(() => {
        const toKeep = Array.filter(
          notificationsState,
          (n) =>
            !(
              n.userId === userId &&
              Array.contains(types, n.type) &&
              n.status === 'pending'
            )
        )
        notificationsState.length = 0
        notificationsState.push(...toKeep)
      }),

    deleteUndeliveredNonCareForMemberOnCanopy: (
      userId: string,
      canopyId: string
    ) =>
      Effect.sync(() => {
        const plantIds = options.canopyPlants?.(canopyId) ?? []
        deleteWhere(
          table,
          (n) =>
            n.userId === userId &&
            waiting(n) &&
            !Array.contains(CARE_TOPICS, n.type) &&
            n.plantId !== undefined &&
            Array.contains(plantIds, n.plantId)
        )
      }),

    deleteUndeliveredNonCareOfNonOwners: (plantIds: ReadonlyArray<string>) =>
      Effect.sync(() => {
        deleteWhere(
          table,
          (n) =>
            n.plantId !== undefined &&
            Array.contains(plantIds, n.plantId) &&
            waiting(n) &&
            !deliveryClaims.has(n.id) &&
            !Array.contains(CARE_TOPICS, n.type) &&
            options.plantOwner?.(n.plantId) !== n.userId
        )
      }),

    hasNotificationIn: ({ userId, topics, plantId, counting, from, until }) =>
      Effect.sync(() =>
        Array.some(notificationsState, (n) => {
          const counted =
            counting === 'sent'
              ? { at: n.sentAt, statuses: ['sent'] }
              : { at: n.createdAt, statuses: ['pending', 'queued', 'sent'] }
          return (
            n.userId === userId &&
            (topics === undefined || Array.contains(topics, n.type)) &&
            (plantId === undefined || n.plantId === plantId) &&
            Array.contains(counted.statuses, n.status) &&
            Option.exists(
              Option.fromNullishOr(counted.at),
              (at) => at >= from && (until === undefined || at < until)
            )
          )
        })
      ),
  }

  return Layer.succeed(NotificationRepository, repo)
}
