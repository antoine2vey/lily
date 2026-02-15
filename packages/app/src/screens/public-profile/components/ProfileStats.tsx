import { Array } from 'effect'
import { Pressable, Text, View } from 'react-native'

interface StatItem {
  readonly value: number
  readonly label: string
  readonly onPress?: () => void
}

interface ProfileStatsProps {
  readonly stats: readonly StatItem[]
}

export function ProfileStats({ stats }: ProfileStatsProps) {
  return (
    <View className="mx-4 rounded-2xl p-4 flex-row bg-surface dark:bg-surface-dark border border-border/30 dark:border-slate-700/30 shadow-sm">
      {Array.map(stats, (stat, index) => (
        <Pressable
          key={stat.label}
          onPress={stat.onPress}
          disabled={!stat.onPress}
          className={`flex-1 items-center gap-1 ${index < Array.length(stats) - 1 ? 'border-r border-border/50 dark:border-slate-700/50' : ''}`}
        >
          <Text
            className="text-lg text-text-primary dark:text-white"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
          >
            {stat.value}
          </Text>
          <Text
            className="text-xs text-text-muted dark:text-slate-400"
            style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          >
            {stat.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}
