import { useMutation } from '@tanstack/react-query'
import { createFileFromUri, uploadMultipart } from 'src/utils/upload'

interface UploadChatImageResult {
  imageUrl: string
}

export function useUploadChatImage(plantId: string) {
  return useMutation({
    mutationFn: async (imageUri: string) => {
      const file = createFileFromUri(imageUri, {
        name: `chat-${Date.now()}.jpg`,
        type: 'image/jpeg',
      })

      return uploadMultipart<UploadChatImageResult>(
        `/api/plants/${plantId}/chat/upload`,
        [file]
      )
    },
  })
}
