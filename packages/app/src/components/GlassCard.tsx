import { BlurView } from 'expo-blur'
import type { ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

interface GlassCardProps {
  children: ReactNode
  padding?: 'sm' | 'md'
  /** Stretch to the remaining height, e.g. to hold a scrolling list. */
  fill?: boolean
  style?: ViewStyle
}

/**
 * Frosted card that floats above the home indicator on the mesh background.
 * The tint stays dark in light mode too: a light tint washes out white text
 * on the pale light-mode mesh. Padding lives on an inner View because
 * NativeWind ignores `className` on BlurView.
 */
export function GlassCard({
  children,
  padding = 'md',
  fill = false,
  style,
}: GlassCardProps) {
  const insets = useSafeAreaInsets()

  return (
    <View
      className={`mx-4 rounded-[32px] overflow-hidden border border-white/15 ${fill ? 'flex-1' : ''}`}
      style={[{ marginBottom: insets.bottom + 16 }, style]}
    >
      <BlurView
        intensity={30}
        tint="dark"
        style={fill ? { flex: 1 } : undefined}
      >
        <View
          className={`${padding === 'sm' ? 'p-5 gap-5' : 'p-6 gap-6'} ${fill ? 'flex-1' : ''}`}
        >
          {children}
        </View>
      </BlurView>
    </View>
  )
}
