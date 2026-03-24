import { useMutation } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

interface RevokeGiftResponse {
  readonly message: string
  readonly userId: string
  readonly tier: string
  readonly status: string
}

export const useRevokeGift = () =>
  useMutation({
    mutationFn: (userId: string) =>
      apiRequest<RevokeGiftResponse>(`/api/admin/users/${userId}/revoke-gift`, {
        method: 'POST',
      }),
  })
