import { nowAsEpochMillis } from '@lily/shared'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { createFileFromUri, uploadMultipart } from '@/utils/upload'

interface PlantAlternative {
  name: string | null
  confidence: number
}

export interface DetectPlantResult {
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
  potSizeCm: number | null
  potSize: string | null
  imageUrl: string
  detectedType: 'plant' | 'card' | 'unknown'
}

/**
 * Hook to detect and identify a plant or nursery card from a photo.
 * Uses the unified /plants/detect endpoint that auto-classifies
 * the image as plant vs card and runs the appropriate AI pipeline.
 */
export function useDetectPlant() {
  const { i18n } = useTranslation()

  return useMutation({
    mutationFn: async (photoUri: string): Promise<DetectPlantResult> => {
      const file = createFileFromUri(photoUri, {
        name: `detect-${String(nowAsEpochMillis())}.jpg`,
        type: 'image/jpeg',
      })

      return uploadMultipart<DetectPlantResult>(
        '/api/plants/detect',
        [file],
        'images',
        { locale: i18n.language }
      )
    },
    retry: 1,
  })
}
