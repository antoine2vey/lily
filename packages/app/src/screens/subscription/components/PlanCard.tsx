import { Match, pipe } from 'effect'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { Badge } from 'src/components/Badge'

interface PlanCardProps {
  planName: string
  status: 'active' | 'trialing' | 'canceled' | 'past_due'
  children: ReactNode
}

export function PlanCard({ planName, status, children }: PlanCardProps) {
  const statusBadge = pipe(
    Match.value(status),
    Match.when('active', () => (
      <Badge label="Active" variant="success" size="sm" />
    )),
    Match.when('trialing', () => (
      <Badge label="Trial" variant="info" size="sm" />
    )),
    Match.when('canceled', () => (
      <Badge label="Canceled" variant="neutral" size="sm" />
    )),
    Match.when('past_due', () => (
      <Badge label="Past Due" variant="warning" size="sm" />
    )),
    Match.exhaustive
  )

  return (
    <View className="mx-4 rounded-2xl p-4 shadow-sm bg-surface">
      <View className="flex-row items-start justify-between mb-4">
        <View>
          <Text className="text-xs mb-1 uppercase tracking-wide font-medium text-text-muted">
            Current Plan
          </Text>
          <Text className="text-2xl font-bold text-text-primary">
            {planName}
          </Text>
        </View>
        {statusBadge}
      </View>
      {children}
    </View>
  )
}
