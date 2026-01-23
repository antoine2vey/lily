import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileFromUri, uploadMultipart } from '@/utils/upload'

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
      const file = createFileFromUri(photoUri, {
        name: `plant-${plantId}-${Date.now()}.jpg`,
        type: 'image/jpeg',
      })

      await uploadMultipart<void>(`/api/plants/${plantId}/photos`, [file])
    },
    onSuccess: (_, { plantId }) => {
      // Invalidate plant photos
      queryClient.invalidateQueries({
        queryKey: ['plants', 'getPlantPhotos'],
      })
      // Invalidate plant detail (photo count may have changed)
      queryClient.invalidateQueries({
        queryKey: ['plants', 'getPlant'],
      })
    },
  })
}
