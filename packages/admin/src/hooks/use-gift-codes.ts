import { useMutation, useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export interface GiftCodeItem {
  readonly id: string
  readonly code: string
  readonly duration: string
  readonly maxUsages: number
  readonly currentUsages: number
  readonly isActive: boolean
  readonly expiresAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

interface GiftCodeRedemption {
  readonly id: string
  readonly giftCodeId: string
  readonly userId: string
  readonly userName: string | null
  readonly userEmail: string
  readonly redeemedAt: string
}

interface GiftCodeWithRedemptions extends GiftCodeItem {
  readonly redemptions: readonly GiftCodeRedemption[]
}

interface PaginatedGiftCodes {
  readonly items: readonly GiftCodeItem[]
  readonly total: number
  readonly page: number
  readonly limit: number
  readonly hasMore: boolean
}

interface CreateGiftCodeRequest {
  readonly code: string
  readonly duration: string
  readonly maxUsages: number
  readonly expiresAt?: string
}

interface UpdateGiftCodeRequest {
  readonly code?: string
  readonly duration?: string
  readonly maxUsages?: number
  readonly isActive?: boolean
  readonly expiresAt?: string | null
}

export const useGiftCodes = (page = 1) =>
  useQuery({
    queryKey: ['gift-codes', page],
    queryFn: () =>
      apiRequest<PaginatedGiftCodes>(
        `/api/admin/gift-codes?page=${page}&limit=20`
      ),
  })

export const useGiftCode = (id: string) =>
  useQuery({
    queryKey: ['gift-codes', id],
    queryFn: () =>
      apiRequest<GiftCodeWithRedemptions>(`/api/admin/gift-codes/${id}`),
    enabled: !!id,
  })

export const useCreateGiftCode = () =>
  useMutation({
    mutationFn: (data: CreateGiftCodeRequest) =>
      apiRequest<GiftCodeItem>('/api/admin/gift-codes', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  })

export const useUpdateGiftCode = () =>
  useMutation({
    mutationFn: ({ id, ...data }: UpdateGiftCodeRequest & { id: string }) =>
      apiRequest<GiftCodeItem>(`/api/admin/gift-codes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  })

export const useDeleteGiftCode = () =>
  useMutation({
    mutationFn: (id: string) =>
      apiRequest<GiftCodeItem>(`/api/admin/gift-codes/${id}`, {
        method: 'DELETE',
      }),
  })
