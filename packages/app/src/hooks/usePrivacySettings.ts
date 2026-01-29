import type { UserSettings } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiEffectRunner, useEffectQuery } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

interface PrivacySettings {
  publicProfile: boolean
  shareGrowthData: boolean
  personalizedTips: boolean
}

// Query key used for optimistic updates (matches useEffectQuery format)
const USER_SETTINGS_QUERY_KEY = ['users', 'getUserSettings', {}]

export function usePrivacySettings() {
  const query = useEffectQuery('users', 'getUserSettings', {})
  return {
    ...query,
    data: query.data?.privacy,
  }
}

export function useUpdatePrivacySettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<PrivacySettings>) => {
      const result = await apiEffectRunner('users', 'updateUserSettings', {
        payload: { privacy: settings },
      })
      return result.privacy
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: USER_SETTINGS_QUERY_KEY })
      const previous = queryClient.getQueryData<UserSettings>(
        USER_SETTINGS_QUERY_KEY
      )

      queryClient.setQueryData<UserSettings>(
        USER_SETTINGS_QUERY_KEY,
        (old): UserSettings | undefined => {
          if (!old) return undefined
          return {
            ...old,
            privacy: {
              ...old.privacy,
              ...newSettings,
            },
          }
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
