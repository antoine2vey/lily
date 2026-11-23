import type { PaginatedResponse } from '@lily/shared'
import { API_PREFIX } from '@lily/shared'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

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
    queryKey: queryKeys.users.conversations(id, page),
    queryFn: () =>
      apiRequest<PaginatedResponse<AdminConversationItem>>(
        `${API_PREFIX}/admin/users/${id}/conversations?page=${page}&limit=10`
      ),
    enabled: !!id,
  })
