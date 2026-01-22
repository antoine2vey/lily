import type { CareLog } from '@lily/shared/care-log'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Array, pipe } from 'effect'
import { apiEffectRunner } from '@/utils/client'

type AppCareType = 'water' | 'fertilize'
type BackendCareType = 'watering' | 'fertilization'

interface SaveCareLogInput {
  plantIds: string[]
  type: AppCareType
  date: Date
  time: Date
  notes?: string
  photoUrl?: string
}

/**
 * Map app care type to backend care type
 */
function mapAppTypeToBackend(type: AppCareType): BackendCareType {
  return type === 'water' ? 'watering' : 'fertilization'
}

/**
 * Combine date and time into a single Date object
 */
function combineDateAndTime(date: Date, time: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    time.getHours(),
    time.getMinutes(),
    0,
    0
  )
}

async function saveCareLogApi(input: SaveCareLogInput): Promise<CareLog[]> {
  const combinedDate = combineDateAndTime(input.date, input.time)
  const backendType = mapAppTypeToBackend(input.type)

  // Create care logs for each plant in parallel
  const results = await Promise.all(
    pipe(
      input.plantIds,
      Array.map((plantId) =>
        apiEffectRunner('careLogs', 'createCareLog', {
          path: { plantId },
          payload: {
            type: backendType,
            notes: input.notes,
            date: combinedDate,
            photoUrl: input.photoUrl,
          },
        })
      )
    )
  )

  return results
}

export function useSaveCareLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: saveCareLogApi,
    onSuccess: (_, variables) => {
      // Invalidate care logs for each plant
      pipe(
        variables.plantIds,
        Array.forEach((plantId) => {
          queryClient.invalidateQueries({
            queryKey: ['careLogs', 'getCareLogs'],
          })
        })
      )
      // Invalidate care tasks
      queryClient.invalidateQueries({ queryKey: ['care-tasks'] })
      // Invalidate plants list (may update last watered/fertilized dates)
      queryClient.invalidateQueries({ queryKey: ['plants'] })
    },
  })
}

// Export types for consumers
export type { SaveCareLogInput, AppCareType }
