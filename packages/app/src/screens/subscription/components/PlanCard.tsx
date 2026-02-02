import { Match, pipe } from 'effect'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'

interface PlanCardProps {
  planName: string
  status: 'active' | 'trialing' | 'canceled' | 'expired' | 'past_due'
  children: ReactNode
}

export function PlanCard({ planName, status, children }: PlanCardProps) {
  const { t } = useTranslation('subscription')

  const statusBadge = pipe(
    Match.value(status),
    Match.when('active', () => (
      <View className="px-3 py-1 rounded-full border border-primary/20 bg-primary-tint">
        <Text className="text-xs font-semibold text-primary">
          {t('status.active')}
        </Text>
      </View>
    )),
    Match.when('trialing', () => (
      <View className="px-3 py-1 rounded-full border border-info/20 bg-info/10">
        <Text className="text-xs font-semibold text-info">
          {t('status.trial')}
        </Text>
      </View>
    )),
    Match.when('canceled', () => (
      <View className="px-3 py-1 rounded-full border border-border dark:border-slate-700 bg-surface-tinted dark:bg-slate-800">
        <Text className="text-xs font-semibold text-text-muted dark:text-slate-400">
          {t('status.canceled')}
        </Text>
      </View>
    )),
    Match.when('expired', () => (
      <View className="px-3 py-1 rounded-full border border-border dark:border-slate-700 bg-surface-tinted dark:bg-slate-800">
        <Text className="text-xs font-semibold text-text-muted dark:text-slate-400">
          {t('status.expired')}
        </Text>
      </View>
    )),
    Match.when('past_due', () => (
      <View className="px-3 py-1 rounded-full border border-warning/20 bg-warning/10">
        <Text className="text-xs font-semibold text-warning">
          {t('status.pastDue')}
        </Text>
      </View>
    )),
    Match.exhaustive
  )

  return (
    <View className="mx-4 rounded-2xl p-6 shadow-sm border border-border/30 dark:border-slate-700/30 bg-surface dark:bg-surface-dark">
      <View className="flex-row items-start justify-between mb-6">
        <View className="gap-1">
          <Text className="text-xs uppercase tracking-wider font-bold text-text-muted dark:text-slate-400">
            {t('usage.currentPlan')}
          </Text>
          <Text className="text-3xl font-bold text-text-primary dark:text-white">
            {planName}
          </Text>
        </View>
        {statusBadge}
      </View>
      <View className="gap-5">{children}</View>
    </View>
  )
}
