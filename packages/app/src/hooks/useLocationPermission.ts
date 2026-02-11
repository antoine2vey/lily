import * as Location from 'expo-location'
import { useCallback, useState } from 'react'

interface LocationState {
  status: Location.PermissionStatus | null
  location: { latitude: number; longitude: number } | null
  loading: boolean
  error: string | null
}

export const useLocationPermission = () => {
  const [state, setState] = useState<LocationState>({
    status: null,
    location: null,
    loading: false,
    error: null,
  })

  const requestPermission = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      setState((prev) => ({ ...prev, status }))

      if (status !== Location.PermissionStatus.GRANTED) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: 'Location permission denied',
        }))
        return null
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })

      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }

      setState((prev) => ({ ...prev, location, loading: false }))
      return location
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to get location',
      }))
      return null
    }
  }, [])

  return {
    status: state.status,
    location: state.location,
    loading: state.loading,
    error: state.error,
    requestPermission,
  }
}
