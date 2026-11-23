import { API_PREFIX, type CareType } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DateTime, Effect, Option } from 'effect'
import { apiEffectRunner } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'
import { createFileFromUri, uploadMultipart } from '@/utils/upload'

interface SaveCareLogInput {
  plantIds: string[]
  type: CareType
  date: Date
  time: Date
  notes?: string | undefined
  photoUri?: string | undefined
}

const combineDateAndTime = (date: Date, time: Date): Date => {
  const dateParts = DateTime.toParts(DateTime.makeUnsafe(date))
  const timeParts = DateTime.toParts(DateTime.makeUnsafe(time))
  const combined = DateTime.makeUnsafe({
    year: dateParts.year,
    month: dateParts.month,
    day: dateParts.day,
    hour: timeParts.hour,
    minute: timeParts.minute,
    second: 0,
    millisecond: 0,
  })
  return DateTime.toDateUtc(combined)
}

async function saveCareLogApi(input: SaveCareLogInput): Promise<void> {
  const fields = {
    type: input.type,
    notes: input.notes,
    date: combineDateAndTime(input.date, input.time),
  }

  const createAsJson = (plantId: string) =>
    apiEffectRunner('careLogs', 'createCareLog', {
      params: { plantId },
      payload: fields,
    })

  const createWithPhoto = (plantId: string, photoUri: string) =>
    uploadMultipart<unknown>(
      `${API_PREFIX}/plants/${plantId}/logs`,
      [createFileFromUri(photoUri)],
      'image',
      { data: JSON.stringify(fields) }
    )

  return Effect.runPromise(
    Effect.forEach(
      input.plantIds,
      (plantId) =>
        Effect.tryPromise(() =>
          Option.match(Option.fromNullishOr(input.photoUri), {
            onNone: () => createAsJson(plantId),
            onSome: (photoUri) => createWithPhoto(plantId, photoUri),
          })
        ),
      { concurrency: 'unbounded', discard: true }
    )
  )
}

export function useSaveCareLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: saveCareLogApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
      // Invalidate plants list (may update last watered/fertilized dates)
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
    },
  })
}

export type { SaveCareLogInput }
