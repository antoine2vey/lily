import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

interface GiftEvent {
  readonly id: string
  readonly userId: string
  readonly userName: string | null
  readonly userEmail: string
  readonly eventType: string
  readonly metadata: string | null
  readonly createdAt: string
}

interface PaginatedGiftHistory {
  readonly items: readonly GiftEvent[]
  readonly total: number
  readonly page: number
  readonly limit: number
  readonly hasMore: boolean
}

export type { GiftEvent }

export const useGiftHistory = (page = 1) =>
  useQuery({
    queryKey: ['gift-history', page],
    queryFn: () =>
      apiRequest<PaginatedGiftHistory>(
        `/api/admin/gift-history?page=${page}&limit=20`
      ),
  })
