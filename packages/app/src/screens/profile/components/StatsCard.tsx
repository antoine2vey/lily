import { Array } from 'effect'
import { Text, View } from 'react-native'

interface StatItem {
  value: string | number
  label: string
}

interface StatsCardProps {
  stats: StatItem[]
}

export function StatsCard({ stats }: StatsCardProps) {
  return (
    <View className="mx-4 rounded-2xl p-4 flex-row bg-surface dark:bg-surface-dark border border-border/30 dark:border-slate-700/30 shadow-sm">
      {Array.map(stats, (stat, index) => (
        <View
          key={stat.label}
          className={`flex-1 items-center gap-1 ${index < Array.length(stats) - 1 ? 'border-r border-border/50 dark:border-slate-700/50' : ''}`}
        >
          <Text className="text-lg font-bold text-text-primary dark:text-white">
            {stat.value}
          </Text>
          <Text className="text-xs font-medium text-text-muted dark:text-slate-400">
            {stat.label}
          </Text>
        </View>
      ))}
    </View>
  )
}
