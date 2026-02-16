import { Match, pipe } from 'effect'
import { Text, View } from 'react-native'

type DelegationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'active'
  | 'completed'
  | 'canceled'

interface DelegationStatusBadgeProps {
  status: DelegationStatus
}

interface StatusStyle {
  bg: string
  text: string
  label: string
}

const getStatusStyle = (status: DelegationStatus): StatusStyle =>
  pipe(
    Match.value(status),
    Match.when('pending', () => ({
      bg: 'bg-amber-100 dark:bg-amber-700/20',
      text: 'text-amber-700 dark:text-amber-400',
      label: 'Pending',
    })),
    Match.when('accepted', () => ({
      bg: 'bg-blue-100 dark:bg-blue-900/20',
      text: 'text-blue-600 dark:text-blue-400',
      label: 'Accepted',
    })),
    Match.when('rejected', () => ({
      bg: 'bg-orange-100 dark:bg-orange-900/20',
      text: 'text-coral dark:text-orange-400',
      label: 'Declined',
    })),
    Match.when('active', () => ({
      bg: 'bg-primary-tint dark:bg-primary/20',
      text: 'text-primary dark:text-primary-light',
      label: 'Active',
    })),
    Match.when('completed', () => ({
      bg: 'bg-slate-100 dark:bg-slate-700',
      text: 'text-slate-500 dark:text-slate-300',
      label: 'Completed',
    })),
    Match.when('canceled', () => ({
      bg: 'bg-slate-100 dark:bg-slate-700',
      text: 'text-slate-500 dark:text-slate-300',
      label: 'Canceled',
    })),
    Match.exhaustive
  )

export function DelegationStatusBadge({ status }: DelegationStatusBadgeProps) {
  const style = getStatusStyle(status)

  return (
    <View className={`self-start px-3 py-1.5 rounded-full ${style.bg}`}>
      <Text
        className={`text-xs font-semibold ${style.text}`}
        style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
      >
        {style.label}
      </Text>
    </View>
  )
}
