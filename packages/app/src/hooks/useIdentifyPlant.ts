import { useMutation } from '@tanstack/react-query'
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
}

/**
 * Parse the streamed JSON text response from AI identify endpoint
 */
function parseStreamedResponse(text: string): PlantIdentificationResult {
  try {
    return JSON.parse(text) as PlantIdentificationResult
  } catch {
    // Default response if parsing fails
    return {
      name: null,
      family: null,
      confidence: 0,
      alternatives: [],
    }
  }
}

/**
 * Hook to identify a plant from a photo using AI
 */
export function useIdentifyPlant() {
  return useMutation({
    mutationFn: async (
      photoUri: string
    ): Promise<PlantIdentificationResult> => {
      const file = createFileFromUri(photoUri, {
        name: `identify-${Date.now()}.jpg`,
        type: 'image/jpeg',
      })

      // Upload and get streamed response as text
      const responseText = await uploadMultipart<string>(
        '/plants/ai-identify',
        [file],
        'images' // The backend expects 'images' as the field name
      )

      return parseStreamedResponse(responseText)
    },
    retry: 1,
  })
}

// Export types for consumers
export type { PlantIdentificationResult, PlantAlternative }
