import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

interface PrivacySettings {
  publicProfile: boolean
  shareGrowthData: boolean
  personalizedTips: boolean
}

async function fetchPrivacySettings(): Promise<PrivacySettings> {
  // TODO: Implement actual API call when backend is ready
  // const response = await api.user.privacySettings()
  // return response

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 300))

  return {
    publicProfile: false,
    shareGrowthData: true,
    personalizedTips: true,
  }
}

async function updatePrivacySettings(
  settings: Partial<PrivacySettings>
): Promise<PrivacySettings> {
  // TODO: Implement actual API call when backend is ready
  // const response = await api.user.updatePrivacySettings(settings)
  // return response

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 300))

  return settings as PrivacySettings
}

export function usePrivacySettings() {
  return useQuery({
    queryKey: ['privacySettings'],
    queryFn: fetchPrivacySettings,
  })
}

export function useUpdatePrivacySettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updatePrivacySettings,
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: ['privacySettings'] })
      const previousSettings = queryClient.getQueryData<PrivacySettings>([
        'privacySettings',
      ])
      queryClient.setQueryData<PrivacySettings>(['privacySettings'], (old) => ({
        ...(old ?? {}),
        ...newSettings,
      }))
      return { previousSettings }
    },
    onError: (_err, _newSettings, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(['privacySettings'], context.previousSettings)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['privacySettings'] })
    },
  })
}
