import { useMutation } from '@tanstack/react-query'
import { Array as Arr } from 'effect'
import type { PlantIdentificationResult } from 'src/hooks/useIdentifyPlant'
import { createFileFromUri, uploadMultipart } from '@/utils/upload'

/**
 * Hook to scan a nursery card photo using AI.
 * Returns the same PlantIdentificationResult as useIdentifyPlant,
 * so the same results screen can be reused.
 */
export function useScanCard() {
  return useMutation({
    mutationFn: async (
      photoUri: string
    ): Promise<PlantIdentificationResult> => {
      const file = createFileFromUri(photoUri, {
        name: `scan-card-${Date.now()}.jpg`,
        type: 'image/jpeg',
      })

      return uploadMultipart<PlantIdentificationResult>(
        '/api/plants/scan-card',
        [file],
        'images'
      )
    },
    retry: 1,
  })
}

/**
 * Hook to scan multiple nursery card photos at once.
 * Sends all images in a single request, returns one combined result.
 */
export function useScanCardMultiple() {
  return useMutation({
    mutationFn: async (
      photoUris: string[]
    ): Promise<PlantIdentificationResult> => {
      const files = Arr.map(photoUris, (uri, index) =>
        createFileFromUri(uri, {
          name: `scan-card-${Date.now()}-${index}.jpg`,
          type: 'image/jpeg',
        })
      )

      return uploadMultipart<PlantIdentificationResult>(
        '/api/plants/scan-card-multiple',
        files,
        'images'
      )
    },
    retry: 1,
  })
}
