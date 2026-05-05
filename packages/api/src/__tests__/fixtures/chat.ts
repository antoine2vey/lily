import type { ChatConversation, ChatMessage } from '@lily/shared/ai-chat'

export const mockPlantConversation: ChatConversation = {
  id: 'conv-plant-1',
  userId: 'user-1',
  kind: 'plant',
  plantId: 'plant-1',
  createdAt: new Date('2024-01-15T09:00:00Z'),
  lastMessageAt: new Date('2024-01-15T10:02:00Z'),
}

export const mockChatMessages: ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'How often should I water this plant?',
    imageUrl: undefined,
    conversationId: 'conv-plant-1',
    userId: 'user-1',
    createdAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'Based on your plant type, I recommend watering every 3-4 days.',
    imageUrl: undefined,
    conversationId: 'conv-plant-1',
    userId: 'user-1',
    createdAt: new Date('2024-01-15T10:01:00Z'),
  },
  {
    id: 'msg-3',
    role: 'user',
    content: 'What about sunlight?',
    imageUrl: undefined,
    conversationId: 'conv-plant-1',
    userId: 'user-1',
    createdAt: new Date('2024-01-15T10:02:00Z'),
  },
  {
    id: 'msg-4',
    role: 'user',
    content: 'Hello plant!',
    imageUrl: undefined,
    conversationId: 'conv-plant-2',
    userId: 'user-1',
    createdAt: new Date('2024-01-16T09:00:00Z'),
  },
  {
    id: 'msg-5',
    role: 'user',
    content: 'Different user message',
    imageUrl: undefined,
    conversationId: 'conv-other-user',
    userId: 'user-2',
    createdAt: new Date('2024-01-17T08:00:00Z'),
  },
]

export const createTestChatMessage = (
  overrides: Partial<ChatMessage> = {}
): ChatMessage => ({
  id: `msg-${crypto.randomUUID()}`,
  role: 'user',
  content: 'Test message',
  imageUrl: undefined,
  conversationId: 'conv-plant-1',
  userId: 'user-1',
  createdAt: new Date(),
  ...overrides,
})
