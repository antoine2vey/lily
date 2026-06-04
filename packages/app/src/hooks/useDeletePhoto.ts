import type { PlantDetail, PlantPhotosListResponse } from '@lily/shared'
import { useQueryClient } from '@tanstack/react-query'
import {
  type ApiResult,
  isApiResultError,
  useEffectMutation,
} from '@/utils/client'
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
 *
 * Note on rollback: useEffectMutation's mutationFn resolves with an Either and
 * never rejects, so a typed API failure surfaces as a `Left` in onSuccess (not
 * onError). We therefore roll back from BOTH paths — onError for thrown/network
 * defects, and onSuccess when the resolved result is a Left.
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
      const plantId = vars.path.id
      const { photoId } = vars.path
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
    onSuccess: (result, _vars, context) => {
      // A typed API failure resolves as a Left here, not via onError.
      if (isApiResultError(result)) {
        rollback(context as DeletePhotoContext | undefined)
      }
    },
    onError: (_err, _vars, context) => {
      rollback(context as DeletePhotoContext | undefined)
    },
    onSettled: (_data, _err, vars) => {
      // Scoped to this plant's two queries — avoids refetching every other plant.
      queryClient.invalidateQueries({ queryKey: plantDetailKey(vars.path.id) })
      queryClient.invalidateQueries({ queryKey: plantPhotosKey(vars.path.id) })
    },
  })
}
