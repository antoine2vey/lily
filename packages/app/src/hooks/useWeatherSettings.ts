import type { UserSettings } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert } from 'react-native'
import { useLocationPermission } from 'src/hooks/useLocationPermission'
import { apiEffectRunner, useEffectQuery } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

// Query key used for optimistic updates (matches useEffectQuery format)
const USER_SETTINGS_QUERY_KEY = ['users', 'getUserSettings', {}]

export function useWeatherSettings() {
  const query = useEffectQuery('users', 'getUserSettings', {})
  return {
    ...query,
    data: query.data?.weather,
  }
}

export function useToggleWeather() {
  const queryClient = useQueryClient()
  const { requestPermission } = useLocationPermission()

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      if (enabled) {
        // Request location permission and get current position
        const location = await requestPermission()
        if (!location) {
          throw new Error('Location permission denied')
        }

        const result = await apiEffectRunner('users', 'updateUserSettings', {
          payload: {
            weather: {
              enabled: true,
              latitude: location.latitude,
              longitude: location.longitude,
            },
          },
        })
        return result.weather
      }

      // Disable weather
      const result = await apiEffectRunner('users', 'updateUserSettings', {
        payload: {
          weather: { enabled: false },
        },
      })
      return result.weather
    },
    onMutate: async (enabled) => {
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
            weather: {
              ...old.weather,
              enabled,
            },
          }
        }
      )

      return { previous }
    },
    onError: (error, _, context) => {
      // Revert optimistic update
      if (context?.previous) {
        queryClient.setQueryData(USER_SETTINGS_QUERY_KEY, context.previous)
      }

      if (
        error instanceof Error &&
        error.message === 'Location permission denied'
      ) {
        Alert.alert(
          'Location Required',
          'Weather-based care adjustments require location access to fetch local weather data. Please enable location access in your device settings.',
          [{ text: 'OK' }]
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.settings() })
    },
  })
}
