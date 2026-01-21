import { useQuery } from '@tanstack/react-query'

type MessageRole = 'user' | 'assistant'

interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  imageUrl?: string
  createdAt: string
}

async function fetchChatHistory(plantId?: string): Promise<ChatMessage[]> {
  // TODO: Implement actual API call when backend is ready
  // const messages = await api.chat.history(plantId)
  // return messages

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 300))

  // Mock response - recent messages first (for inverted list)
  return [
    {
      id: 'msg-1',
      role: 'assistant',
      content:
        'The brown tips on your Monstera leaves could be caused by:\n\n1. **Low humidity** - These tropical plants prefer 60%+ humidity\n2. **Inconsistent watering** - Let the top inch of soil dry between waterings\n3. **Too much direct sunlight** - They prefer bright, indirect light\n\nTry misting the leaves daily and moving it away from direct sun. Would you like me to set up a care reminder?',
      createdAt: new Date(Date.now() - 60000).toISOString(),
    },
    {
      id: 'msg-2',
      role: 'user',
      content: 'Why are the tips of my Monstera leaves turning brown?',
      createdAt: new Date(Date.now() - 120000).toISOString(),
    },
    {
      id: 'msg-3',
      role: 'assistant',
      content:
        "Hello! I'm Lily, your plant care assistant. 🌿 I'm here to help you keep your plants healthy and thriving!\n\nFeel free to ask me anything about plant care, watering schedules, or troubleshooting plant problems.",
      createdAt: new Date(Date.now() - 180000).toISOString(),
    },
  ]
}

export function useChatHistory(plantId?: string) {
  return useQuery({
    queryKey: ['chat-history', plantId],
    queryFn: () => fetchChatHistory(plantId),
  })
}
