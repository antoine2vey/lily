import { API_PREFIX, nowAsEpochMillis } from '@lily/shared'
import { useMutation } from '@tanstack/react-query'
import { Array as Arr } from 'effect'
import { useTranslation } from 'react-i18next'
import { createFileFromUri, uploadMultipart } from '@/utils/upload'

interface PlantAlternative {
  name: string | null
  confidence: number
}

interface PlantIdentificationResult {
  name: string | null
  family: string | null
  confidence: number
  alternatives: PlantAlternative[]
  wateringFrequencyDays: number | null
  luxNeeded: number | null
  humidityRating: number | null
  petToxicityRating: number | null
  fertilizationFrequencyDays: number | null
  mistingFrequencyDays: number | null
  repottingFrequencyDays: number | null
  category: string | null
  description: string | null
  wateringTips: string | null
  imageUrl: string
}

/**
 * Hook to scan a nursery card photo using AI.
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
        `${API_PREFIX}/plants/scan-card`,
        [file],
        'images',
        { locale: i18n.language }
      )
    },
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
        `${API_PREFIX}/plants/scan-card-multiple`,
        files,
        'images',
        { locale: i18n.language }
      )
    },
  })
}
