import { useMutation } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export interface PromptPreviewMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly createdAt: string
}

export interface PromptPreviewPlant {
  readonly id: string
  readonly name: string
  readonly category: string | null
  readonly description: string | null
  readonly health: string
  readonly humidityRating: number
  readonly lightingRating: number
  readonly wateringRating: number
  readonly petToxicityRating: number
  readonly wateringFrequencyDays: number
  readonly lastWateredAt: string | null
  readonly nextWateringAt: string | null
  readonly fertilizationFrequencyDays: number | null
  readonly lastFertilizedAt: string | null
  readonly nextFertilizationAt: string | null
  readonly dateAdded: string
  readonly daysSinceAdded: number
}

export interface PromptPreviewCareEntry {
  readonly type: string
  readonly date: string
  readonly notes: string | null
}

export interface PromptPreviewRagChunk {
  readonly id: string
  readonly content: string
  readonly source: string
  readonly sourceUrl?: string
  readonly plantType?: string
  readonly category?: string
  readonly metadata?: unknown
  readonly similarity: number
}

export interface PromptPreviewConversationEntry {
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly createdAt: string
}

export interface PromptPreviewResponse {
  readonly message: PromptPreviewMessage
  readonly plant: PromptPreviewPlant
  readonly careHistory: ReadonlyArray<PromptPreviewCareEntry>
  readonly ragQuery: string
  readonly ragChunks: ReadonlyArray<PromptPreviewRagChunk>
  readonly formattedRagContext: string
  readonly conversationHistory: ReadonlyArray<PromptPreviewConversationEntry>
  readonly systemPrompt: string
  readonly model: string
  readonly hasImage: boolean
}

export const usePromptPreview = () =>
  useMutation({
    mutationFn: (messageId: string) =>
      apiRequest<PromptPreviewResponse>(
        `/api/admin/prompt-preview/${messageId}`
      ),
  })
