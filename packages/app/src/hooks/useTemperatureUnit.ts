import { Match, Option, pipe } from 'effect'
import { useUser } from '@/hooks/useUser'

export function useTemperatureUnit() {
  const { data } = useUser()

  const unit = pipe(
    Option.fromNullable(data?.temperatureUnit),
    Option.getOrElse(() => 'celsius' as const)
  )

  const formatTemp = (celsius: number | null): string => {
    if (celsius === null) return '--'

    return pipe(
      Match.value(unit),
      Match.when('celsius', () => `${Math.round(celsius)}°C`),
      Match.when('fahrenheit', () => `${Math.round((celsius * 9) / 5 + 32)}°F`),
      Match.exhaustive
    )
  }

  return { unit, formatTemp }
}
