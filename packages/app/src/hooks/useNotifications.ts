import type { Notification, NotificationsListResponse } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Either } from 'effect'
import { type ApiResult, apiEffectRunner, useEffectQuery } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

const NOTIFICATIONS_QUERY_KEY = [
  'notifications',
  'getNotifications',
  { urlParams: { page: '1', limit: '20', status: 'sent' } },
]

export function useNotifications(page = 1) {
  return useEffectQuery('notifications', 'getNotifications', {
    urlParams: { page: String(page), limit: '20', status: 'sent' },
  })
}

export function useUnreadCount() {
  const query = useEffectQuery(
    'notifications',
    'getUnreadCount',
    {},
    { staleTime: 60_000 }
  )
  return { ...query, count: query.data?.count ?? 0 }
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (notificationId: string) =>
      apiEffectRunner('notifications', 'markNotificationRead', {
        path: { notificationId },
      }),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.notifications.lists(),
      })
      const previous = queryClient.getQueryData<
        ApiResult<NotificationsListResponse>
      >(NOTIFICATIONS_QUERY_KEY)

      queryClient.setQueryData<ApiResult<NotificationsListResponse>>(
        NOTIFICATIONS_QUERY_KEY,
        (old) => {
          if (!old) return undefined
          return Either.map(old, (response) => ({
            ...response,
            items: response.items.map((n: Notification) =>
              n.id === notificationId ? { ...n, isRead: true } : n
            ),
          }))
        }
      )

      return { previous }
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.lists(),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.unreadCount(),
      })
    },
  })
}

export function useMarkAllRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => apiEffectRunner('notifications', 'markAllRead', {}),
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.notifications.lists(),
      })
      const previous = queryClient.getQueryData<
        ApiResult<NotificationsListResponse>
      >(NOTIFICATIONS_QUERY_KEY)

      queryClient.setQueryData<ApiResult<NotificationsListResponse>>(
        NOTIFICATIONS_QUERY_KEY,
        (old) => {
          if (!old) return undefined
          return Either.map(old, (response) => ({
            ...response,
            items: response.items.map((n: Notification) => ({
              ...n,
              isRead: true,
            })),
          }))
        }
      )

      return { previous }
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.lists(),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.unreadCount(),
      })
    },
  })
}

export function useDeleteNotification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (notificationId: string) =>
      apiEffectRunner('notifications', 'deleteNotification', {
        path: { notificationId },
      }),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.notifications.lists(),
      })
      const previous = queryClient.getQueryData<
        ApiResult<NotificationsListResponse>
      >(NOTIFICATIONS_QUERY_KEY)

      queryClient.setQueryData<ApiResult<NotificationsListResponse>>(
        NOTIFICATIONS_QUERY_KEY,
        (old) => {
          if (!old) return undefined
          return Either.map(old, (response) => ({
            ...response,
            items: response.items.filter(
              (n: Notification) => n.id !== notificationId
            ),
            total: response.total - 1,
          }))
        }
      )

      return { previous }
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.lists(),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.unreadCount(),
      })
    },
  })
}
