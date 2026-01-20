import { Match, pipe } from 'effect'
import type { ReactNode } from 'react'
import { Pressable, View, type ViewStyle } from 'react-native'

type CardVariant = 'elevated' | 'outlined' | 'filled'
type CardPadding = 'none' | 'sm' | 'md' | 'lg'

interface CardProps {
  children: ReactNode
  onPress?: () => void
  variant?: CardVariant
  padding?: CardPadding
  style?: ViewStyle
}

const getPaddingClass = (padding: CardPadding): string =>
  pipe(
    Match.value(padding),
    Match.when('none', () => 'p-0'),
    Match.when('sm', () => 'p-2'),
    Match.when('md', () => 'p-4'),
    Match.when('lg', () => 'p-6'),
    Match.exhaustive
  )

const getVariantClass = (variant: CardVariant): string =>
  pipe(
    Match.value(variant),
    Match.when('elevated', () => 'bg-white'),
    Match.when('outlined', () => 'bg-white border border-border'),
    Match.when('filled', () => 'bg-surface-tinted'),
    Match.exhaustive
  )

const getElevatedShadowStyle = (variant: CardVariant): ViewStyle =>
  pipe(
    Match.value(variant),
    Match.when('elevated', () => ({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    })),
    Match.orElse(() => ({}))
  )

export function Card({
  children,
  onPress,
  variant = 'elevated',
  padding = 'md',
  style,
}: CardProps) {
  const paddingClass = getPaddingClass(padding)
  const variantClass = getVariantClass(variant)
  const shadowStyle = getElevatedShadowStyle(variant)

  const content = (
    <View
      className={`rounded-2xl ${paddingClass} ${variantClass}`}
      style={[shadowStyle, style]}
    >
      {children}
    </View>
  )

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        {content}
      </Pressable>
    )
  }

  return content
}
