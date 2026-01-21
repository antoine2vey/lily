import { useMutation, useQueryClient } from '@tanstack/react-query'

type CareType = 'water' | 'fertilize' | 'prune' | 'rotate' | 'mist' | 'repot'

interface SaveCareLogInput {
  plantIds: string[]
  type: CareType
  date: Date
  time: Date
  notes?: string
  photoUri?: string
}

interface CareLog {
  id: string
  plantId: string
  type: CareType
  notes?: string
  photoUrl?: string
  createdAt: string
}

async function saveCareLogApi(input: SaveCareLogInput): Promise<CareLog[]> {
  // TODO: Implement actual API call when backend is ready
  // const logs = await api.careLogs.create(input)
  // return logs

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 500))

  // Mock response - create a log for each plant
  return input.plantIds.map((plantId) => ({
    id: `log-${Date.now()}-${plantId}`,
    plantId,
    type: input.type,
    notes: input.notes,
    photoUrl: input.photoUri,
    createdAt: new Date(
      input.date.getFullYear(),
      input.date.getMonth(),
      input.date.getDate(),
      input.time.getHours(),
      input.time.getMinutes()
    ).toISOString(),
  }))
}

export function useSaveCareLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: saveCareLogApi,
    onSuccess: (_, variables) => {
      // Invalidate care history for each plant
      variables.plantIds.forEach((plantId) => {
        queryClient.invalidateQueries({ queryKey: ['care-history', plantId] })
      })
      // Invalidate care tasks
      queryClient.invalidateQueries({ queryKey: ['care-tasks'] })
    },
  })
}
