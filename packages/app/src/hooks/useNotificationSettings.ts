import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

interface NotificationSettings {
  careReminders: boolean
  reminderTime: string // HH:mm format
  weeklyDigest: boolean
  achievements: boolean
  tips: boolean
  productUpdates: boolean
  doNotDisturb: boolean
  doNotDisturbStart: string // HH:mm format
  doNotDisturbEnd: string // HH:mm format
}

async function fetchNotificationSettings(): Promise<NotificationSettings> {
  // TODO: Implement actual API call when backend is ready
  // const settings = await api.notifications.getSettings()
  // return settings

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 300))

  // Mock response
  return {
    careReminders: true,
    reminderTime: '09:00',
    weeklyDigest: true,
    achievements: true,
    tips: true,
    productUpdates: false,
    doNotDisturb: false,
    doNotDisturbStart: '22:00',
    doNotDisturbEnd: '07:00',
  }
}

async function updateNotificationSettingsApi(
  settings: Partial<NotificationSettings>
): Promise<NotificationSettings> {
  // TODO: Implement actual API call when backend is ready
  // const updated = await api.notifications.updateSettings(settings)
  // return updated

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 300))

  // Return merged settings (mock)
  return {
    careReminders: true,
    reminderTime: '09:00',
    weeklyDigest: true,
    achievements: true,
    tips: true,
    productUpdates: false,
    doNotDisturb: false,
    doNotDisturbStart: '22:00',
    doNotDisturbEnd: '07:00',
    ...settings,
  }
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: ['notification-settings'],
    queryFn: fetchNotificationSettings,
  })
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateNotificationSettingsApi,
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: ['notification-settings'] })
      const previous = queryClient.getQueryData<NotificationSettings>([
        'notification-settings',
      ])

      queryClient.setQueryData<NotificationSettings>(
        ['notification-settings'],
        (old) => ({
          ...(old ?? {}),
          ...newSettings,
        })
      )

      return { previous }
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['notification-settings'], context.previous)
      }
    },
  })
}
