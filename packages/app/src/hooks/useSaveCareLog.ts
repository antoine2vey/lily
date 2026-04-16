import type { CareType } from '@lily/shared'
import type { CareLog } from '@lily/shared/care-log'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DateTime, Effect } from 'effect'
import { apiEffectRunner } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

interface SaveCareLogInput {
  plantIds: string[]
  type: CareType
  date: Date
  time: Date
  notes?: string | undefined
  photoUrl?: string | undefined
}

const combineDateAndTime = (date: Date, time: Date): Date => {
  const dateParts = DateTime.toParts(DateTime.unsafeMake(date))
  const timeParts = DateTime.toParts(DateTime.unsafeMake(time))
  const combined = DateTime.unsafeMake({
    year: dateParts.year,
    month: dateParts.month,
    day: dateParts.day,
    hours: timeParts.hours,
    minutes: timeParts.minutes,
    seconds: 0,
    millis: 0,
  })
  return DateTime.toDateUtc(combined)
}

async function saveCareLogApi(input: SaveCareLogInput): Promise<CareLog[]> {
  const combinedDate = combineDateAndTime(input.date, input.time)

  return Effect.runPromise(
    Effect.forEach(
      input.plantIds,
      (plantId) =>
        Effect.tryPromise(() =>
          apiEffectRunner('careLogs', 'createCareLog', {
            path: { plantId },
            payload: {
              type: input.type,
              notes: input.notes,
              date: combinedDate,
              photoUrl: input.photoUrl,
            },
          })
        ),
      { concurrency: 'unbounded' }
    )
  )
}

export function useSaveCareLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: saveCareLogApi,
    onSuccess: () => {
      // Invalidate care logs
      queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all })
      // Invalidate care tasks
      queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
      // Invalidate plants list (may update last watered/fertilized dates)
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
    },
  })
}

// Export types for consumers
export type { SaveCareLogInput }
