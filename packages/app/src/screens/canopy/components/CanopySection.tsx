import type { ReactNode } from 'react'
import { Text, View } from 'react-native'

interface CanopySectionProps {
  title: string
  aside?: string
  children: ReactNode
}

export function CanopySection({ title, aside, children }: CanopySectionProps) {
  return (
    <View className="mb-6">
      <View className="flex-row items-center justify-between mb-2 mx-3">
        <Text className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-slate-400">
          {title}
        </Text>
        {aside && (
          <Text className="text-xs text-text-muted dark:text-slate-400">
            {aside}
          </Text>
        )}
      </View>
      <View className="bg-surface dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-border/30 dark:border-slate-700/30">
        {children}
      </View>
    </View>
  )
}
