import { type CareType, parseApiDate, StaleTime } from '@lily/shared'
import { Array, DateTime, Match, Option, pipe } from 'effect'
import { useEffectQuery } from '@/utils/client'

// UI activity type - maps API types to display types
export type ActivityType =
  | 'watered'
  | 'fertilized'
  | 'added'
  | 'moved'
  | 'misted'
  | 'repotted'

export interface UIActivity {
  id: string
  type: ActivityType
  plantId: string
  plantName: string
  timestamp: Date
  plantImageUrl?: string | undefined
}

// Map API care log types to UI activity types
const mapCareLogTypeToActivityType = (type: CareType): ActivityType =>
  pipe(
    Match.value(type),
    Match.when('watering', () => 'watered' as const),
    Match.when('fertilization', () => 'fertilized' as const),
    Match.when('misting', () => 'misted' as const),
    Match.when('repotting', () => 'repotted' as const),
    Match.exhaustive
  )

// Convert API date to Date object for UI consumption
const toDate = (dateInput: Date | string): Date =>
  dateInput instanceof Date
    ? dateInput
    : pipe(
        parseApiDate(dateInput),
        Option.map(DateTime.toDateUtc),
        Option.getOrElse(() => DateTime.toDateUtc(DateTime.unsafeNow()))
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
        timestamp: toDate(item.date),
        plantImageUrl: item.plantImageUrl,
      }))
    ),
    Option.getOrElse(() => [] as UIActivity[])
  )

  return { ...query, data: activities }
}
