import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DateTime } from 'effect'
import { queryKeys } from 'src/utils/query-keys'
import { createFileFromUri, uploadMultipart } from 'src/utils/upload'

interface UploadPhotoParams {
  plantId: string
  photoUri: string
}

/**
 * Hook to upload a photo to a plant
 */
export function useUploadPhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ plantId, photoUri }: UploadPhotoParams) => {
      const timestamp = DateTime.toEpochMillis(DateTime.unsafeNow())
      const file = createFileFromUri(photoUri, {
        name: `plant-${plantId}-${timestamp}.jpg`,
        type: 'image/jpeg',
      })

      await uploadMultipart<void>(`/api/plants/${plantId}/photos`, [file])
    },
    onSuccess: () => {
      // Invalidate plant photos and details
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.details() })
    },
  })
}
