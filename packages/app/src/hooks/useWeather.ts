import type { CareAdjustment, WeatherData } from '@lily/shared'
import { Array, Option, pipe } from 'effect'
import { useWeatherSettings } from '@/hooks/useWeatherSettings'
import { useEffectQuery } from '@/utils/client'

interface AdjustmentSummary {
  adjustedCount: number
  skipWateringCount: number
  skipFertilizationCount: number
}

export function useWeather() {
  const weatherSettings = useWeatherSettings()
  const weatherEnabled = weatherSettings.data?.enabled === true

  const forecastQuery = useEffectQuery(
    'weather',
    'getWeather',
    {},
    { enabled: weatherEnabled }
  )

  const adjustmentsQuery = useEffectQuery(
    'weather',
    'getCareAdjustments',
    {},
    { enabled: weatherEnabled }
  )

  const todayWeather: Option.Option<WeatherData> = pipe(
    Option.fromNullable(forecastQuery.data?.daily),
    Option.flatMap(Array.head)
  )

  const adjustmentSummary: AdjustmentSummary = pipe(
    Option.fromNullable(adjustmentsQuery.data),
    Option.map((adjustments: readonly CareAdjustment[]) => ({
      adjustedCount: Array.length(
        Array.filter(adjustments, (a) => a.wateringMultiplier !== 1)
      ),
      skipWateringCount: Array.length(
        Array.filter(adjustments, (a) => a.skipWatering)
      ),
      skipFertilizationCount: Array.length(
        Array.filter(adjustments, (a) => a.skipFertilization)
      ),
    })),
    Option.getOrElse(() => ({
      adjustedCount: 0,
      skipWateringCount: 0,
      skipFertilizationCount: 0,
    }))
  )

  const isLoading =
    weatherEnabled &&
    (forecastQuery.isLoading || adjustmentsQuery.isLoading) &&
    !forecastQuery.data

  const error = forecastQuery.error ?? adjustmentsQuery.error

  const refetch = async () => {
    if (weatherEnabled) {
      await Promise.all([forecastQuery.refetch(), adjustmentsQuery.refetch()])
    }
  }

  return {
    weatherEnabled,
    todayWeather,
    adjustmentSummary,
    isLoading,
    error,
    refetch,
  }
}
