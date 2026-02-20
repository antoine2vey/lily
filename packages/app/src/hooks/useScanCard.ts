import { nowAsEpochMillis } from '@lily/shared'
import { useMutation } from '@tanstack/react-query'
import { Array as Arr } from 'effect'
import { useTranslation } from 'react-i18next'
import type { PlantIdentificationResult } from 'src/hooks/useIdentifyPlant'
import { createFileFromUri, uploadMultipart } from 'src/utils/upload'

/**
 * Hook to scan a nursery card photo using AI.
 * Returns the same PlantIdentificationResult as useIdentifyPlant,
 * so the same results screen can be reused.
 */
export function useScanCard() {
  const { i18n } = useTranslation()

  return useMutation({
    mutationFn: async (
      photoUri: string
    ): Promise<PlantIdentificationResult> => {
      const file = createFileFromUri(photoUri, {
        name: `scan-card-${String(nowAsEpochMillis())}.jpg`,
        type: 'image/jpeg',
      })

      return uploadMultipart<PlantIdentificationResult>(
        '/api/plants/scan-card',
        [file],
        'images',
        { locale: i18n.language }
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
  const { i18n } = useTranslation()

  return useMutation({
    mutationFn: async (
      photoUris: string[]
    ): Promise<PlantIdentificationResult> => {
      const files = Arr.map(photoUris, (uri, index) =>
        createFileFromUri(uri, {
          name: `scan-card-${String(nowAsEpochMillis())}-${String(index)}.jpg`,
          type: 'image/jpeg',
        })
      )

      return uploadMultipart<PlantIdentificationResult>(
        '/api/plants/scan-card-multiple',
        files,
        'images',
        { locale: i18n.language }
      )
    },
    retry: 1,
  })
}
