import type { PaginatedResponse } from '@lily/shared'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export interface AdminPlantItem {
  readonly id: string
  readonly name: string
  readonly category: string | null
  readonly health: string
  readonly dateAdded: string
  readonly isFavorite: boolean
  readonly imageUrl: string | null
  readonly room: { readonly name: string } | null
  readonly schedules: ReadonlyArray<unknown>
}

export const useAdminUserPlants = (id: string, page: number) =>
  useQuery({
    queryKey: ['admin-user-plants', id, page],
    queryFn: () =>
      apiRequest<PaginatedResponse<AdminPlantItem>>(
        `/api/admin/users/${id}/plants?page=${page}&limit=10`
      ),
    enabled: !!id,
  })
