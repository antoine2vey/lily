import { useMutation, useQueryClient } from '@tanstack/react-query'

interface SendMessageInput {
  content: string
  imageUri?: string
  plantId?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string
  createdAt: string
}

async function sendMessageApi(input: SendMessageInput): Promise<ChatMessage> {
  // TODO: Implement actual API call when backend is ready
  // const response = await api.chat.send(input)
  // return response

  // Mock delay for AI response
  await new Promise((resolve) => setTimeout(resolve, 1500))

  // Mock AI response based on input
  const responses = [
    "That's a great question! Most houseplants prefer indirect light. For your specific plant, I'd recommend placing it near a north or east-facing window.",
    'Yellowing leaves can have several causes:\n\n1. **Overwatering** - Check if the soil is soggy\n2. **Underwatering** - Check if the soil is bone dry\n3. **Natural aging** - Lower leaves may yellow over time\n\nCould you tell me more about your watering routine?',
    "I'd be happy to help! Based on what you've described, it sounds like your plant might benefit from:\n\n• More humidity\n• Slightly less water\n• A bit more indirect light\n\nLet me know if you'd like specific tips for any of these!",
  ]

  return {
    id: `msg-${Date.now()}`,
    role: 'assistant',
    content: responses[Math.floor(Math.random() * responses.length)],
    createdAt: new Date().toISOString(),
  }
}

export function useSendMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: sendMessageApi,
    onMutate: async (input) => {
      // Optimistically add user message
      const userMessage: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: input.content,
        imageUrl: input.imageUri,
        createdAt: new Date().toISOString(),
      }

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['chat-history', input.plantId],
      })

      // Snapshot previous value
      const previousMessages = queryClient.getQueryData<ChatMessage[]>([
        'chat-history',
        input.plantId,
      ])

      // Optimistically update
      queryClient.setQueryData<ChatMessage[]>(
        ['chat-history', input.plantId],
        (old) => [userMessage, ...(old ?? [])]
      )

      return { previousMessages }
    },
    onSuccess: (response, input) => {
      // Add AI response to cache
      queryClient.setQueryData<ChatMessage[]>(
        ['chat-history', input.plantId],
        (old) => [response, ...(old ?? [])]
      )
    },
    onError: (_, input, context) => {
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData(
          ['chat-history', input.plantId],
          context.previousMessages
        )
      }
    },
  })
}
