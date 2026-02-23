import type { UserSettings } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Either } from 'effect'
import { type ApiResult, apiEffectRunner, useEffectQuery } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

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

// Query key used for optimistic updates (matches useEffectQuery format)
const USER_SETTINGS_QUERY_KEY = ['users', 'getUserSettings', {}]

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
      await queryClient.cancelQueries({ queryKey: USER_SETTINGS_QUERY_KEY })
      const previous = queryClient.getQueryData<ApiResult<UserSettings>>(
        USER_SETTINGS_QUERY_KEY
      )

      queryClient.setQueryData<ApiResult<UserSettings>>(
        USER_SETTINGS_QUERY_KEY,
        (old) => {
          if (!old) return undefined
          return Either.map(old, (settings) => ({
            ...settings,
            notifications: {
              ...settings.notifications,
              ...newSettings,
            },
          }))
        }
      )

      return { previous }
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(USER_SETTINGS_QUERY_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.settings() })
    },
  })
}
