import { Match, pipe } from 'effect'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

type ChipVariant = 'filter' | 'input' | 'suggestion'

interface ChipProps {
  label: string
  selected?: boolean
  onPress?: () => void
  icon?: ReactNode
  variant?: ChipVariant
  disabled?: boolean
}

const getVariantClasses = (variant: ChipVariant): string =>
  pipe(
    Match.value(variant),
    Match.when('filter', () => 'px-4 py-2 rounded-full'),
    Match.when('input', () => 'px-3 py-1.5 rounded-lg'),
    Match.when('suggestion', () => 'px-3.5 py-2.5 rounded-full'),
    Match.exhaustive
  )

export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  variant = 'filter',
  disabled = false,
}: ChipProps) {
  const variantClasses = getVariantClasses(variant)
  const bgClass = selected ? 'bg-primary' : 'bg-white border border-slate-200'
  const textClass = selected ? 'text-white' : 'text-text-primary'
  const opacityClass = disabled ? 'opacity-50' : ''

  const content = (
    <View
      className={`flex-row items-center gap-1.5 ${variantClasses} ${bgClass} ${opacityClass}`}
    >
      {icon}
      <Text className={`text-sm font-medium ${textClass}`} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        className={`${disabled ? '' : 'active:opacity-80'}`}
      >
        {content}
      </Pressable>
    )
  }

  return content
}
