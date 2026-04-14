import { BlurView } from 'expo-blur'
import type { ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeContext } from '@/contexts/ThemeContext'

interface GlassCardProps {
  children: ReactNode
  padding?: 'sm' | 'md'
  style?: ViewStyle
}

export function GlassCard({ children, padding = 'md', style }: GlassCardProps) {
  const { isDark } = useThemeContext()
  const insets = useSafeAreaInsets()

  return (
    <View
      className="mx-4 rounded-3xl overflow-hidden"
      style={[{ marginBottom: insets.bottom + 16 }, style]}
    >
      <BlurView
        intensity={40}
        tint={isDark ? 'dark' : 'light'}
        className={padding === 'sm' ? 'p-5' : 'p-6'}
      >
        {children}
      </BlurView>
    </View>
  )
}
