import { StaleTime } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import { useEffectQuery } from 'src/utils/client'

// UI activity type - maps API types to display types
export type ActivityType =
  | 'watered'
  | 'fertilized'
  | 'added'
  | 'moved'
  | 'misted'
  | 'pruned'

export interface UIActivity {
  id: string
  type: ActivityType
  plantId: string
  plantName: string
  timestamp: Date
  plantImageUrl?: string
}

// Map API care log types to UI activity types
const mapCareLogTypeToActivityType = (
  type: 'watering' | 'fertilization'
): ActivityType =>
  pipe(
    Match.value(type),
    Match.when('watering', () => 'watered' as const),
    Match.when('fertilization', () => 'fertilized' as const),
    Match.exhaustive
  )

export function useRecentActivities(limit = 10) {
  const query = useEffectQuery(
    'careLogs',
    'getRecentActivities',
    { urlParams: { limit: String(limit) } },
    { staleTime: StaleTime.short }
  )

  // Transform API data to UI format
  const activities: UIActivity[] = pipe(
    Option.fromNullable(query.data?.items),
    Option.map(
      Array.map((item) => ({
        id: item.id,
        type: mapCareLogTypeToActivityType(item.type),
        plantId: item.plantId,
        plantName: item.plantName,
        timestamp: item.date instanceof Date ? item.date : new Date(item.date),
        plantImageUrl: item.plantImageUrl,
      }))
    ),
    Option.getOrElse(() => [] as UIActivity[])
  )

  return { ...query, data: activities }
}
