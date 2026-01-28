import type { UserSettings } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiEffectRunner, useEffectQuery } from 'src/utils/client'

interface PrivacySettings {
  publicProfile: boolean
  shareGrowthData: boolean
  personalizedTips: boolean
}

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
      await queryClient.cancelQueries({
        queryKey: ['users', 'getUserSettings', {}],
      })
      const previous = queryClient.getQueryData<UserSettings>([
        'users',
        'getUserSettings',
        {},
      ])

      queryClient.setQueryData<UserSettings>(
        ['users', 'getUserSettings', {}],
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
