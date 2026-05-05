import { useMutation } from '@tanstack/react-query'
import { createFileFromUri, uploadMultipart } from '@/utils/upload'

interface UploadResult {
  imageUrl: string
  imageKey: string
}

export function useUploadConversationImage(conversationId: string) {
  return useMutation({
    mutationFn: async (imageUri: string) => {
      const file = createFileFromUri(imageUri, {
        name: `chat-${Date.now()}.jpg`,
        type: 'image/jpeg',
      })

      return uploadMultipart<UploadResult>(
        `/api/chat/conversations/${conversationId}/upload`,
        [file]
      )
    },
  })
}
