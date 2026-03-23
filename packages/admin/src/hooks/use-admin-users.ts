import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

interface AdminUser {
  readonly id: string
  readonly name: string | null
  readonly email: string
  readonly role: string
  readonly status: string
}

interface PaginatedUsers {
  readonly items: ReadonlyArray<AdminUser>
  readonly total: number
}

export const useAdminUsers = (search: string, enabled: boolean) =>
  useQuery({
    queryKey: ['admin-users', search],
    queryFn: () =>
      apiRequest<PaginatedUsers>(
        `/api/admin/users?search=${encodeURIComponent(search)}&limit=10`
      ),
    enabled: enabled && search.length >= 2,
  })
