import { Option, pipe } from 'effect'
import { useMemo } from 'react'
import { useSubscription } from 'src/hooks/useSubscription'

interface UsageItem {
  type: 'ai_chats' | 'plant_ids' | 'card_scans'
  current: number
  max: number
}

interface SubscriptionUsage {
  planName: string
  status: 'active' | 'trialing' | 'canceled' | 'expired' | 'past_due' | null
  usage: UsageItem[]
  isPremium: boolean
}

export function useSubscriptionUsage() {
  const { data, isLoading, error } = useSubscription()

  const usage = useMemo((): SubscriptionUsage | undefined => {
    if (!data) return undefined

    const tierConfig = data.tierConfig
    const isPremium = tierConfig.tier === 'paid'

    const status: SubscriptionUsage['status'] = pipe(
      Option.fromNullable(data.subscription),
      Option.map((s) => s.status),
      Option.getOrNull
    )

    const usageCounts = data.usage

    const usageItems: UsageItem[] = [
      {
        type: 'ai_chats',
        current: pipe(
          Option.fromNullable(usageCounts),
          Option.map((u) => u.aiChatsCount),
          Option.getOrElse(() => 0)
        ),
        max: tierConfig.maxAiChatsMonthly ?? Infinity,
      },
      {
        type: 'plant_ids',
        current: pipe(
          Option.fromNullable(usageCounts),
          Option.map((u) => u.plantIdentifiesCount),
          Option.getOrElse(() => 0)
        ),
        max: tierConfig.maxPlantIdentifiesMonthly ?? Infinity,
      },
      {
        type: 'card_scans',
        current: pipe(
          Option.fromNullable(usageCounts),
          Option.map((u) => u.cardScansCount),
          Option.getOrElse(() => 0)
        ),
        max: tierConfig.maxCardScansMonthly ?? Infinity,
      },
    ]

    return {
      planName: tierConfig.name,
      status,
      usage: usageItems,
      isPremium,
    }
  }, [data])

  return { data: usage, isLoading, error }
}
