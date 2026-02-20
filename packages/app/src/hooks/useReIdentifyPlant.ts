import { useMutation } from '@tanstack/react-query'
import * as SecureStore from 'expo-secure-store'
import { useTranslation } from 'react-i18next'
import type { PlantIdentificationResult } from '@/hooks/useIdentifyPlant'
import { ACCESS_TOKEN_KEY, API_BASE_URL } from '@/utils/client'

/**
 * Hook to re-identify a plant from existing image URLs using AI.
 * Unlike useIdentifyPlant, this doesn't upload files — it reuses
 * already-uploaded GCS URLs.
 */
export function useReIdentifyPlant() {
  const { i18n } = useTranslation()

  return useMutation({
    mutationFn: async (
      imageUrls: readonly string[]
    ): Promise<PlantIdentificationResult> => {
      const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch(
        `${API_BASE_URL}/api/plants/ai-re-identify`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            imageUrls,
            locale: i18n.language,
          }),
        }
      )

      if (!response.ok) {
        throw new Error(`Re-identify failed: ${response.status}`)
      }

      return response.json()
    },
  })
}
