import type { PromptPreviewResponse as PromptPreviewResponseSchema } from '@lily/shared/admin'
import { useMutation } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export type PromptPreviewResponse = typeof PromptPreviewResponseSchema.Encoded
export type PromptPreviewCareEntry =
  PromptPreviewResponse['careHistory'][number]
export type PromptPreviewRagChunk = PromptPreviewResponse['ragChunks'][number]
export type PromptPreviewConversationEntry =
  PromptPreviewResponse['conversationHistory'][number]

export const usePromptPreview = () =>
  useMutation({
    mutationFn: (messageId: string) =>
      apiRequest<PromptPreviewResponse>(
        `/api/admin/prompt-preview/${messageId}`
      ),
  })
