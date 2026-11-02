import type { PlantDetail, PlantPhotosListResponse } from '@lily/shared'
import { useQueryClient } from '@tanstack/react-query'
import { type ApiResult, useEffectMutation } from '@/utils/client'
import {
  plantDetailKey,
  plantPhotosKey,
  removePhotoFromDetail,
  removePhotoFromList,
} from '@/utils/plant-cache'

interface DeletePhotoContext {
  prevDetail: ApiResult<PlantDetail> | undefined
  prevPhotos: ApiResult<PlantPhotosListResponse> | undefined
  plantId: string
}

/**
 * Delete a plant photo. Optimistic: the photo disappears instantly from both
 * the plant detail and Growth Journal caches, and is restored on failure.
 */
export function useDeletePhoto() {
  const queryClient = useQueryClient()

  const rollback = (context: DeletePhotoContext | undefined) => {
    if (!context) return
    if (context.prevDetail) {
      queryClient.setQueryData(
        plantDetailKey(context.plantId),
        context.prevDetail
      )
    }
    if (context.prevPhotos) {
      queryClient.setQueryData(
        plantPhotosKey(context.plantId),
        context.prevPhotos
      )
    }
  }

  return useEffectMutation('plants', 'deletePlantPhoto', {
    onMutate: async (vars) => {
      const plantId = vars.params.id
      const { photoId } = vars.params
      const detailKey = plantDetailKey(plantId)
      const photosKey = plantPhotosKey(plantId)

      await queryClient.cancelQueries({ queryKey: detailKey })
      await queryClient.cancelQueries({ queryKey: photosKey })

      const prevDetail =
        queryClient.getQueryData<ApiResult<PlantDetail>>(detailKey)
      const prevPhotos =
        queryClient.getQueryData<ApiResult<PlantPhotosListResponse>>(photosKey)

      queryClient.setQueryData<ApiResult<PlantDetail>>(detailKey, (old) =>
        removePhotoFromDetail(old, photoId)
      )
      queryClient.setQueryData<ApiResult<PlantPhotosListResponse>>(
        photosKey,
        (old) => removePhotoFromList(old, photoId)
      )

      return { prevDetail, prevPhotos, plantId } satisfies DeletePhotoContext
    },
    onError: (_err, _vars, context) => {
      rollback(context as DeletePhotoContext | undefined)
    },
    onSettled: (_data, _err, vars) => {
      // Scoped to this plant's two queries — avoids refetching every other plant.
      queryClient.invalidateQueries({
        queryKey: plantDetailKey(vars.params.id),
      })
      queryClient.invalidateQueries({
        queryKey: plantPhotosKey(vars.params.id),
      })
    },
  })
}
