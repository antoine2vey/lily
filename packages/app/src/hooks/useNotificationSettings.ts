import type { UserSettings } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Result } from 'effect'
import { apiEffectRunner, useEffectQuery } from '@/utils/client'
import {
  queryKeys,
  USER_SETTINGS_PARAMS,
  USER_SETTINGS_QUERY_KEY,
} from '@/utils/query-keys'

export function useNotificationSettings() {
  const query = useEffectQuery('users', 'getUserSettings', USER_SETTINGS_PARAMS)
  return {
    ...query,
    data: query.data?.notifications,
  }
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<UserSettings['notifications']>) => {
      const result = await apiEffectRunner('users', 'updateUserSettings', {
        payload: { notifications: settings },
      })
      return result.notifications
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: USER_SETTINGS_QUERY_KEY })
      const previous = queryClient.getQueryData(USER_SETTINGS_QUERY_KEY)

      queryClient.setQueryData(USER_SETTINGS_QUERY_KEY, (old) => {
        if (!old) return undefined
        return Result.map(old, (settings) => ({
          ...settings,
          notifications: {
            ...settings.notifications,
            ...newSettings,
          },
        }))
      })

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
