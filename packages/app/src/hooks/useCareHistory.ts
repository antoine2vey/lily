import { useQuery } from '@tanstack/react-query'

type CareEventType =
  | 'water'
  | 'fertilize'
  | 'prune'
  | 'rotate'
  | 'mist'
  | 'repot'

interface CareEvent {
  id: string
  plantId: string
  type: CareEventType
  notes?: string
  photoUrl?: string
  createdAt: string
}

interface CareHistoryGroup {
  date: string
  events: CareEvent[]
}

async function fetchCareHistory(plantId: string): Promise<CareHistoryGroup[]> {
  // TODO: Implement actual API call when backend is ready
  // const history = await api.careLogs.listByPlant(plantId)
  // return groupByDate(history)

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 300))

  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const threeDaysAgo = new Date(today)
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
  const lastWeek = new Date(today)
  lastWeek.setDate(lastWeek.getDate() - 7)

  // Mock response grouped by date
  return [
    {
      date: 'Today',
      events: [
        {
          id: 'event-1',
          plantId,
          type: 'water',
          notes: 'Soil was very dry',
          createdAt: today.toISOString(),
        },
      ],
    },
    {
      date: 'Yesterday',
      events: [
        {
          id: 'event-2',
          plantId,
          type: 'mist',
          createdAt: yesterday.toISOString(),
        },
      ],
    },
    {
      date: formatDateLabel(threeDaysAgo),
      events: [
        {
          id: 'event-3',
          plantId,
          type: 'fertilize',
          notes: 'Used liquid fertilizer at half strength',
          createdAt: threeDaysAgo.toISOString(),
        },
        {
          id: 'event-4',
          plantId,
          type: 'rotate',
          createdAt: threeDaysAgo.toISOString(),
        },
      ],
    },
    {
      date: formatDateLabel(lastWeek),
      events: [
        {
          id: 'event-5',
          plantId,
          type: 'water',
          createdAt: lastWeek.toISOString(),
        },
        {
          id: 'event-6',
          plantId,
          type: 'prune',
          notes: 'Removed yellow leaves',
          createdAt: lastWeek.toISOString(),
        },
      ],
    },
  ]
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

export function useCareHistory(plantId: string) {
  return useQuery({
    queryKey: ['care-history', plantId],
    queryFn: () => fetchCareHistory(plantId),
    enabled: !!plantId,
  })
}
