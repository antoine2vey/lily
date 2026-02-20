import { nowAsEpochMillis } from '@lily/shared'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { createFileFromUri, uploadMultipart } from 'src/utils/upload'

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
  category: string | null
  description: string | null
  wateringTips: string | null
  imageUrl: string
}

/**
 * Hook to identify a plant from a photo using AI
 */
export function useIdentifyPlant() {
  const { i18n } = useTranslation()

  return useMutation({
    mutationFn: async (
      photoUri: string
    ): Promise<PlantIdentificationResult> => {
      const file = createFileFromUri(photoUri, {
        name: `identify-${String(nowAsEpochMillis())}.jpg`,
        type: 'image/jpeg',
      })

      return uploadMultipart<PlantIdentificationResult>(
        '/api/plants/ai-identify',
        [file],
        'images',
        { locale: i18n.language }
      )
    },
    retry: 1,
  })
}

// Export types for consumers
export type { PlantIdentificationResult, PlantAlternative }
