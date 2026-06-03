import type { PaginatedResponse } from '@lily/shared'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export interface AdminConversationItem {
  readonly id: string
  readonly kind: string
  readonly plantId?: string
  readonly title?: string
  readonly createdAt: string
  readonly lastMessageAt: string
}

export const useAdminUserConversations = (id: string, page: number) =>
  useQuery({
    queryKey: ['admin-user-conversations', id, page],
    queryFn: () =>
      apiRequest<PaginatedResponse<AdminConversationItem>>(
        `/api/admin/users/${id}/conversations?page=${page}&limit=10`
      ),
    enabled: !!id,
  })
