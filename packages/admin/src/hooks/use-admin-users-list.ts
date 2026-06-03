import type { PaginatedResponse } from '@lily/shared'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export interface AdminUserListItem {
  readonly id: string
  readonly name: string | null
  readonly email: string
  readonly role: string
  readonly status: string
  readonly createdAt: string
  readonly deletedAt: string | null
}

interface UseAdminUsersListParams {
  readonly page: number
  readonly search?: string
  readonly role?: string
  readonly status?: string
  readonly limit?: number
}

// Browse-all users list (paginated, optional search + role/status filters).
// Unlike `useAdminUsers` (a search-gated autocomplete capped at 10), this drives
// the full Users table — so it always runs and exposes pagination.
export const useAdminUsersList = (params: UseAdminUsersListParams) =>
  useQuery({
    queryKey: [
      'admin-users-list',
      params.page,
      params.limit ?? 20,
      params.search ?? '',
      params.role ?? '',
      params.status ?? '',
    ],
    queryFn: () => {
      const qs = new URLSearchParams()
      qs.set('page', String(params.page))
      qs.set('limit', String(params.limit ?? 20))
      if (params.search) qs.set('search', params.search)
      if (params.role) qs.set('role', params.role)
      if (params.status) qs.set('status', params.status)
      return apiRequest<PaginatedResponse<AdminUserListItem>>(
        `/api/admin/users?${qs.toString()}`
      )
    },
  })
