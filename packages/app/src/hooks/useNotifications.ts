import type { Notification } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Result } from 'effect'
import { apiEffectRunner, useEffectQuery } from '@/utils/client'
import {
  FIRST_NOTIFICATIONS_PAGE_KEY,
  notificationsParams,
  queryKeys,
} from '@/utils/query-keys'

export function useNotifications(page = 1) {
  return useEffectQuery(
    'notifications',
    'getNotifications',
    notificationsParams(page)
  )
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
        params: { notificationId },
      }),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.notifications.lists(),
      })
      const previous = queryClient.getQueryData(FIRST_NOTIFICATIONS_PAGE_KEY)

      queryClient.setQueryData(FIRST_NOTIFICATIONS_PAGE_KEY, (old) => {
        if (!old) return undefined
        return Result.map(old, (response) => ({
          ...response,
          items: response.items.map((n: Notification) =>
            n.id === notificationId ? { ...n, isRead: true } : n
          ),
        }))
      })

      return { previous }
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(FIRST_NOTIFICATIONS_PAGE_KEY, context.previous)
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
      const previous = queryClient.getQueryData(FIRST_NOTIFICATIONS_PAGE_KEY)

      queryClient.setQueryData(FIRST_NOTIFICATIONS_PAGE_KEY, (old) => {
        if (!old) return undefined
        return Result.map(old, (response) => ({
          ...response,
          items: response.items.map((n: Notification) => ({
            ...n,
            isRead: true,
          })),
        }))
      })

      return { previous }
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(FIRST_NOTIFICATIONS_PAGE_KEY, context.previous)
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
        params: { notificationId },
      }),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.notifications.lists(),
      })
      const previous = queryClient.getQueryData(FIRST_NOTIFICATIONS_PAGE_KEY)

      queryClient.setQueryData(FIRST_NOTIFICATIONS_PAGE_KEY, (old) => {
        if (!old) return undefined
        return Result.map(old, (response) => ({
          ...response,
          items: response.items.filter(
            (n: Notification) => n.id !== notificationId
          ),
          total: response.total - 1,
        }))
      })

      return { previous }
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(FIRST_NOTIFICATIONS_PAGE_KEY, context.previous)
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
