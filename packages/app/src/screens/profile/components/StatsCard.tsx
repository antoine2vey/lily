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
    <View className="mx-4 rounded-2xl py-5 flex-row bg-surface">
      {stats.map((stat, index) => (
        <View
          key={stat.label}
          className={`flex-1 items-center ${index < stats.length - 1 ? 'border-r border-border' : ''}`}
        >
          <Text className="text-xl mb-1 font-bold text-text-primary">
            {stat.value}
          </Text>
          <Text className="text-sm font-regular text-text-muted">
            {stat.label}
          </Text>
        </View>
      ))}
    </View>
  )
}
