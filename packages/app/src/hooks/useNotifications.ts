import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation, useEffectQuery } from '@/utils/client'

interface NotificationsParams {
  page?: string
  limit?: string
  status?: string
}

export function useNotifications(params?: NotificationsParams) {
  return useEffectQuery(
    'notifications',
    'getNotifications',
    {
      urlParams: {
        page: params?.page ?? '1',
        limit: params?.limit ?? '20',
        status: params?.status ?? 'all',
      },
    },
    {
      staleTime: 1000 * 60 * 2, // 2 minutes
    }
  )
}

export function useMarkAsRead() {
  const queryClient = useQueryClient()

  return useEffectMutation('notifications', 'markNotificationRead', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

// Note: useMarkAllAsRead is kept as a placeholder - backend endpoint not yet implemented
export function useMarkAllAsRead() {
  const queryClient = useQueryClient()

  return {
    mutate: () => {
      console.warn('markAllAsRead endpoint not yet implemented in backend')
    },
    mutateAsync: async () => {
      console.warn('markAllAsRead endpoint not yet implemented in backend')
    },
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    data: undefined,
    reset: () => {},
  }
}
