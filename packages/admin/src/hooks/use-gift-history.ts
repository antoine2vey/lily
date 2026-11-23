import { API_PREFIX } from '@lily/shared'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

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
    queryKey: queryKeys.giftHistory.page(page),
    queryFn: () =>
      apiRequest<PaginatedGiftHistory>(
        `${API_PREFIX}/admin/gift-history?page=${page}&limit=20`
      ),
  })
