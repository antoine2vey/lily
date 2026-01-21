import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

type NotificationType = 'care_reminder' | 'achievement' | 'tip' | 'system'

interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string
  read: boolean
  plantId?: string
  createdAt: string
}

interface NotificationsResponse {
  notifications: Notification[]
  unreadCount: number
}

async function fetchNotifications(): Promise<NotificationsResponse> {
  // TODO: Implement actual API call when backend is ready
  // const response = await api.notifications.list()
  // return response

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 300))

  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const twoDaysAgo = new Date(now)
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

  const notifications: Notification[] = [
    {
      id: 'notif-1',
      type: 'care_reminder',
      title: 'Time to water!',
      body: 'Your Monstera is looking thirsty. Give it some water today.',
      read: false,
      plantId: 'plant-1',
      createdAt: now.toISOString(),
    },
    {
      id: 'notif-2',
      type: 'achievement',
      title: 'Achievement Unlocked!',
      body: 'You earned "Plant Parent" - Add your first 5 plants.',
      read: false,
      createdAt: now.toISOString(),
    },
    {
      id: 'notif-3',
      type: 'tip',
      title: 'Plant Tip',
      body: 'Did you know? Rotating your plants weekly helps them grow evenly.',
      read: true,
      createdAt: yesterday.toISOString(),
    },
    {
      id: 'notif-4',
      type: 'care_reminder',
      title: 'Fertilize your Snake Plant',
      body: "It's been 30 days since the last fertilizing.",
      read: true,
      plantId: 'plant-2',
      createdAt: yesterday.toISOString(),
    },
    {
      id: 'notif-5',
      type: 'system',
      title: 'Welcome to Lily!',
      body: 'Start by adding your first plant to begin tracking care.',
      read: true,
      createdAt: twoDaysAgo.toISOString(),
    },
  ]

  const unreadCount = notifications.filter((n) => !n.read).length

  return { notifications, unreadCount }
}

async function markAsReadApi(notificationId: string): Promise<void> {
  // TODO: Implement actual API call
  await new Promise((resolve) => setTimeout(resolve, 200))
}

async function markAllAsReadApi(): Promise<void> {
  // TODO: Implement actual API call
  await new Promise((resolve) => setTimeout(resolve, 300))
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
  })
}

export function useMarkAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: markAsReadApi,
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] })
      const previous = queryClient.getQueryData<NotificationsResponse>([
        'notifications',
      ])

      queryClient.setQueryData<NotificationsResponse>(
        ['notifications'],
        (old) => {
          if (!old) return old
          return {
            ...old,
            notifications: old.notifications.map((n) =>
              n.id === notificationId ? { ...n, read: true } : n
            ),
            unreadCount: Math.max(0, old.unreadCount - 1),
          }
        }
      )

      return { previous }
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['notifications'], context.previous)
      }
    },
  })
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: markAllAsReadApi,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] })
      const previous = queryClient.getQueryData<NotificationsResponse>([
        'notifications',
      ])

      queryClient.setQueryData<NotificationsResponse>(
        ['notifications'],
        (old) => {
          if (!old) return old
          return {
            ...old,
            notifications: old.notifications.map((n) => ({ ...n, read: true })),
            unreadCount: 0,
          }
        }
      )

      return { previous }
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['notifications'], context.previous)
      }
    },
  })
}
