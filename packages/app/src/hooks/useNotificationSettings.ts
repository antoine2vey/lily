import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UserSettings } from '@lily/shared'
import { useEffectQuery } from 'src/utils/client'
import { apiEffectRunner } from 'src/utils/client'

interface NotificationSettings {
  careReminders: boolean
  weeklyDigest: boolean
  achievements: boolean
  tips: boolean
  productUpdates: boolean
  ads: boolean
  doNotDisturb: boolean
  doNotDisturbStart: string
  doNotDisturbEnd: string
}

export function useNotificationSettings() {
  const query = useEffectQuery('users', 'getUserSettings', {})
  return {
    ...query,
    data: query.data?.notifications,
  }
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<NotificationSettings>) => {
      const result = await apiEffectRunner('users', 'updateUserSettings', {
        payload: { notifications: settings },
      })
      return result.notifications
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({
        queryKey: ['users', 'getUserSettings', {}],
      })
      const previous = queryClient.getQueryData<UserSettings>([
        'effect',
        'users',
        'getUserSettings',
      ])

      queryClient.setQueryData<UserSettings>(
        ['users', 'getUserSettings', {}],
        (old): UserSettings | undefined => {
          if (!old) return undefined
          return {
            ...old,
            notifications: {
              ...old.notifications,
              ...newSettings,
            },
          }
        }
      )

      return { previous }
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['users', 'getUserSettings', {}],
          context.previous
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['users', 'getUserSettings', {}],
      })
    },
  })
}
