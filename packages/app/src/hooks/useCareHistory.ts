import type { CareLog } from '@lily/shared/care-log'
import { Array, pipe } from 'effect'
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
function mapBackendType(type: BackendCareType): AppCareType {
  return type === 'watering' ? 'water' : 'fertilize'
}

/**
 * Format a date as a label (Today, Yesterday, or weekday + date)
 */
function formatDateLabel(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const todayOnly = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  )
  const yesterdayOnly = new Date(
    yesterday.getFullYear(),
    yesterday.getMonth(),
    yesterday.getDate()
  )

  if (dateOnly.getTime() === todayOnly.getTime()) {
    return 'Today'
  }
  if (dateOnly.getTime() === yesterdayOnly.getTime()) {
    return 'Yesterday'
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Get date key for grouping (YYYY-MM-DD format)
 */
function getDateKey(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Group care logs by date for display
 */
function groupByDate(logs: readonly CareLog[]): CareHistoryGroup[] {
  // Group logs by date key
  const grouped = pipe(
    logs,
    Array.reduce({} as Record<string, CareEvent[]>, (acc, log) => {
      const dateKey = getDateKey(new Date(log.date))
      const event: CareEvent = {
        id: log.id,
        plantId: log.plantId,
        type: mapBackendType(log.type),
        notes: log.notes,
        photoUrl: log.photoUrl,
        createdAt: new Date(log.createdAt).toISOString(),
      }

      if (!acc[dateKey]) {
        acc[dateKey] = []
      }
      acc[dateKey].push(event)
      return acc
    })
  )

  // Convert to array and sort by date descending
  const entries = Object.entries(grouped)
  const mapped = pipe(
    entries,
    Array.map(([dateKey, events]) => {
      // Sort events by createdAt descending
      const sortedEvents = [...events].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      return {
        date: formatDateLabel(new Date(dateKey)),
        dateKey,
        events: sortedEvents,
      }
    })
  )

  // Sort by dateKey descending
  const sorted = [...mapped].sort((a, b) => b.dateKey.localeCompare(a.dateKey))

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
      staleTime: 1000 * 60 * 5, // 5 minutes
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
