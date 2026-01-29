import { getApiDateGroupLabel, StaleTime, toIsoString } from '@lily/shared'
import type { CareLog } from '@lily/shared/care-log'
import { Array, DateTime, Option, Order, pipe, Record } from 'effect'
import { useEffectQuery } from '@/utils/client'

type BackendCareType = 'watering' | 'fertilization'
type AppCareType = 'water' | 'fertilize'

interface CareEvent {
  id: string
  plantId: string
  type: AppCareType
  notes?: string
  photoUrl?: string
  createdAt: string
}

interface CareHistoryGroup {
  date: string
  events: CareEvent[]
}

/**
 * Map backend care type to app care type
 */
const mapBackendType = (type: BackendCareType): AppCareType =>
  type === 'watering' ? 'water' : 'fertilize'

/**
 * Get date key for grouping (YYYY-MM-DD format)
 */
const getDateKey = (date: Date): string => {
  const dt = DateTime.unsafeMake(date)
  const parts = DateTime.toParts(dt)
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${String(parts.year)}-${month}-${day}`
}

// Order for sorting events by createdAt descending
const eventCreatedAtOrder: Order.Order<CareEvent> = Order.mapInput(
  Order.reverse(Order.string),
  (event) => event.createdAt
)

/**
 * Group care logs by date for display
 */
function groupByDate(logs: readonly CareLog[]): CareHistoryGroup[] {
  // Group logs by date key
  const grouped = pipe(
    logs,
    Array.reduce({} as Record<string, CareEvent[]>, (acc, log) => {
      const dateKey = getDateKey(log.date)
      const createdAtIso = pipe(
        DateTime.make(log.createdAt),
        Option.map(toIsoString),
        Option.getOrElse(() => '')
      )
      const event: CareEvent = {
        id: log.id,
        plantId: log.plantId,
        type: mapBackendType(log.type),
        notes: log.notes,
        photoUrl: log.photoUrl,
        createdAt: createdAtIso,
      }

      if (!acc[dateKey]) {
        acc[dateKey] = []
      }
      acc[dateKey].push(event)
      return acc
    })
  )

  // Convert to array and sort by date descending
  const entries = Record.toEntries(grouped)
  const mapped = pipe(
    entries,
    Array.map(([dateKey, events]) => {
      // Sort events by createdAt descending
      const sortedEvents = Array.sort(events, eventCreatedAtOrder)
      return {
        date: getApiDateGroupLabel(
          dateKey,
          Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
        ),
        dateKey,
        events: sortedEvents,
      }
    })
  )

  // Sort by dateKey descending
  const sorted = Array.sort(
    mapped,
    Order.mapInput(
      Order.reverse(Order.string),
      (item: { date: string; dateKey: string; events: CareEvent[] }) =>
        item.dateKey
    )
  )

  return pipe(
    sorted,
    Array.map(({ date, events }) => ({ date, events }))
  )
}

interface UseCareHistoryParams {
  plantId: string
  type?: 'all' | 'watering' | 'fertilization'
  page?: number
  limit?: number
}

export function useCareHistory({
  plantId,
  type = 'all',
  page = 1,
  limit = 50,
}: UseCareHistoryParams) {
  const query = useEffectQuery(
    'careLogs',
    'getCareLogs',
    {
      path: { plantId },
      urlParams: {
        page: String(page),
        limit: String(limit),
        type,
      },
    },
    {
      enabled: !!plantId,
      staleTime: StaleTime.default,
    }
  )

  // Transform data to grouped format
  const groupedData = query.data ? groupByDate(query.data.items) : undefined

  return {
    ...query,
    data: groupedData,
    rawData: query.data,
  }
}

// Export types for consumers
export type { CareEvent, CareHistoryGroup }
