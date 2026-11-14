import { API_PREFIX } from '@lily/shared'
import { useMutation } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export type GiftDuration = '7d' | '1m' | '1y' | 'infinite'

interface GiftSubscriptionRequest {
  readonly userId: string
  readonly duration: GiftDuration
}

interface GiftSubscriptionResponse {
  readonly message: string
  readonly userId: string
  readonly tier: string
  readonly status: string
  readonly periodStart: string
  readonly periodEnd: string
}

export const useGiftSubscription = () =>
  useMutation({
    mutationFn: ({ userId, duration }: GiftSubscriptionRequest) =>
      apiRequest<GiftSubscriptionResponse>(
        `${API_PREFIX}/admin/users/${userId}/gift-subscription`,
        {
          method: 'POST',
          body: JSON.stringify({ duration }),
        }
      ),
  })
