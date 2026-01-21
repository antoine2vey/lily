import { useQuery } from '@tanstack/react-query'

interface UsageItem {
  type: 'ai_chats' | 'plant_ids' | 'card_scans'
  current: number
  max: number
}

interface SubscriptionUsage {
  planName: string
  status: 'active' | 'trialing' | 'canceled' | 'past_due'
  usage: UsageItem[]
  isPremium: boolean
}

async function fetchSubscriptionUsage(): Promise<SubscriptionUsage> {
  // TODO: Implement actual API call when backend is ready
  // const response = await api.subscriptions.usage()
  // return response

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 300))

  return {
    planName: 'Lily Free',
    status: 'active',
    isPremium: false,
    usage: [
      { type: 'ai_chats', current: 3, max: 10 },
      { type: 'plant_ids', current: 2, max: 5 },
      { type: 'card_scans', current: 5, max: 10 },
    ],
  }
}

export function useSubscriptionUsage() {
  return useQuery({
    queryKey: ['subscription-usage'],
    queryFn: fetchSubscriptionUsage,
  })
}
