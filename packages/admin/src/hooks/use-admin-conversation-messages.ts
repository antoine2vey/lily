import type { PaginatedResponse } from '@lily/shared'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export interface AdminChatMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly imageUrl?: string
  readonly createdAt: string
}

// Messages of one conversation. Only fires once a conversation is selected.
export const useAdminConversationMessages = (
  userId: string,
  conversationId: string | null,
  page: number
) =>
  useQuery({
    queryKey: ['admin-conversation-messages', userId, conversationId, page],
    queryFn: () =>
      apiRequest<PaginatedResponse<AdminChatMessage>>(
        `/api/admin/users/${userId}/conversations/${conversationId}/messages?page=${page}&limit=20`
      ),
    enabled: !!userId && !!conversationId,
  })
