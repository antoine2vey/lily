import {
  nowAsEpochMillis,
  type PlantDetail,
  type PlantPhotosListResponse,
  PlantPhotoUploadResponse,
} from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Array, Option, Schema } from 'effect'
import { Image } from 'expo-image'
import type { ApiResult } from '@/utils/client'
import {
  addPhotoToDetail,
  addPhotoToList,
  makeTempPhoto,
  plantDetailKey,
  plantPhotosKey,
  replacePhotoInDetail,
  replacePhotoInList,
} from '@/utils/plant-cache'
import { createFileFromUri, uploadMultipart } from '@/utils/upload'

interface UploadPhotoParams {
  plantId: string
  photoUri: string
}

interface UploadPhotoContext {
  prevDetail: ApiResult<PlantDetail> | undefined
  prevPhotos: ApiResult<PlantPhotosListResponse> | undefined
  plantId: string
  tempId: string
}

const decodeUploadResponse = Schema.decodeUnknownPromise(
  PlantPhotoUploadResponse
)

/**
 * Upload a photo to a plant. Optimistic: the photo appears instantly (rendered
 * from its local uri) in both the plant detail and Growth Journal caches.
 *
 * Reconcile is flash-free: on success the server returns the persisted photo, we
 * prefetch its CDN url, then swap the temp placeholder for the real one in place
 * (no invalidate/refetch) so the thumbnail never blinks out and back in.
 */
export function useUploadPhoto() {
  const queryClient = useQueryClient()

  return useMutation<
    PlantPhotoUploadResponse,
    Error,
    UploadPhotoParams,
    UploadPhotoContext
  >({
    mutationFn: async ({ plantId, photoUri }) => {
      const file = createFileFromUri(photoUri, {
        name: `plant-${plantId}-${String(nowAsEpochMillis())}.jpg`,
        type: 'image/jpeg',
      })

      // Raw multipart upload bypasses the typed client, so decode the JSON
      // through the schema to get Date-typed `takenAt` (not an ISO string).
      const raw = await uploadMultipart<unknown>(
        `/api/plants/${plantId}/photos`,
        [file]
      )
      return decodeUploadResponse(raw)
    },
    onMutate: async ({ plantId, photoUri }) => {
      const detailKey = plantDetailKey(plantId)
      const photosKey = plantPhotosKey(plantId)

      await queryClient.cancelQueries({ queryKey: detailKey })
      await queryClient.cancelQueries({ queryKey: photosKey })

      const prevDetail =
        queryClient.getQueryData<ApiResult<PlantDetail>>(detailKey)
      const prevPhotos =
        queryClient.getQueryData<ApiResult<PlantPhotosListResponse>>(photosKey)

      const tempPhoto = makeTempPhoto(plantId, photoUri)

      queryClient.setQueryData<ApiResult<PlantDetail>>(detailKey, (old) =>
        addPhotoToDetail(old, tempPhoto)
      )
      queryClient.setQueryData<ApiResult<PlantPhotosListResponse>>(
        photosKey,
        (old) => addPhotoToList(old, tempPhoto)
      )

      return { prevDetail, prevPhotos, plantId, tempId: tempPhoto.id }
    },
    onSuccess: async (data, _vars, context) => {
      const real = Option.getOrNull(Array.head(data.photos))
      // The flash-free swap reconciles exactly one temp → one persisted photo.
      // A single file is uploaded per mutation, so this is the normal path; for
      // anything else (empty, or a future multi-select) fall back to a refetch.
      if (!real || data.photos.length !== 1) {
        queryClient.invalidateQueries({
          queryKey: plantDetailKey(context.plantId),
        })
        queryClient.invalidateQueries({
          queryKey: plantPhotosKey(context.plantId),
        })
        return
      }

      // Warm the CDN image before swapping so the tile never flashes blank.
      await Image.prefetch(real.url).catch(() => false)

      queryClient.setQueryData<ApiResult<PlantDetail>>(
        plantDetailKey(context.plantId),
        (old) => replacePhotoInDetail(old, context.tempId, real)
      )
      queryClient.setQueryData<ApiResult<PlantPhotosListResponse>>(
        plantPhotosKey(context.plantId),
        (old) => replacePhotoInList(old, context.tempId, real)
      )
    },
    onError: (_err, _vars, context) => {
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
    },
  })
}
