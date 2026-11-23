import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Result } from 'effect'
import { Alert } from 'react-native'
import { useLocationPermission } from '@/hooks/useLocationPermission'
import { apiEffectRunner, useEffectQuery } from '@/utils/client'
import {
  queryKeys,
  USER_SETTINGS_PARAMS,
  USER_SETTINGS_QUERY_KEY,
} from '@/utils/query-keys'

export function useWeatherSettings() {
  const query = useEffectQuery('users', 'getUserSettings', USER_SETTINGS_PARAMS)
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
      const previous = queryClient.getQueryData(USER_SETTINGS_QUERY_KEY)

      queryClient.setQueryData(USER_SETTINGS_QUERY_KEY, (old) => {
        if (!old) return undefined
        return Result.map(old, (settings) => ({
          ...settings,
          weather: {
            ...settings.weather,
            enabled,
          },
        }))
      })

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
