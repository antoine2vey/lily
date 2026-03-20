import { nowAsEpochMillis } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Either } from 'effect'
import { queryKeys } from '@/utils/query-keys'
import { createFileFromUri, uploadMultipart } from '@/utils/upload'

interface UpdatePlantParams {
  path: { id: string }
  payload: Record<string, unknown>
}

const plantDetailKey = (id: string) => ['plants', 'getPlant', { path: { id } }]

export function useUpdatePlant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ path, payload }: UpdatePlantParams) => {
      const { imageUrl, ...fields } = payload
      const isLocalFile =
        typeof imageUrl === 'string' && imageUrl.startsWith('file://')

      const files = isLocalFile
        ? [
            createFileFromUri(imageUrl, {
              name: `plant-${path.id}-${String(nowAsEpochMillis())}.jpg`,
              type: 'image/jpeg',
            }),
          ]
        : []

      const data = isLocalFile ? fields : { ...fields, imageUrl }

      return uploadMultipart<unknown>(
        `/api/plants/${path.id}`,
        files,
        'image',
        { data: JSON.stringify(data) },
        'PUT'
      )
    },
    onMutate: async ({ path, payload }) => {
      const key = plantDetailKey(path.id)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)

      queryClient.setQueryData(key, (old: unknown) => {
        if (!old) return undefined
        return Either.map(old as Either.Either<unknown, unknown>, (plant) => ({
          ...(plant as Record<string, unknown>),
          ...payload,
        }))
      })

      return { previous, key }
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous)
      }
    },
    onSettled: (_, __, { path }) => {
      queryClient.invalidateQueries({ queryKey: plantDetailKey(path.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.lists() })
    },
  })
}
