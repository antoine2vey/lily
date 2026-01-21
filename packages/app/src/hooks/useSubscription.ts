import { useQuery } from '@tanstack/react-query'

type PlanType = 'free' | 'pro' | 'premium'
type SubscriptionStatus = 'active' | 'trialing' | 'canceled' | 'past_due'

interface Subscription {
  id: string
  plan: PlanType
  status: SubscriptionStatus
  currentPeriodEnd?: string
  cancelAtPeriodEnd: boolean
}

async function fetchSubscription(): Promise<Subscription> {
  // TODO: Implement actual API call when backend is ready
  // const response = await api.subscriptions.current()
  // return response

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 300))

  return {
    id: 'sub-1',
    plan: 'pro',
    status: 'active',
    currentPeriodEnd: new Date(Date.now() + 86400000 * 30).toISOString(),
    cancelAtPeriodEnd: false,
  }
}

export function useSubscription() {
  return useQuery({
    queryKey: ['subscription'],
    queryFn: fetchSubscription,
  })
}
