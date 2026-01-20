import { Match, pipe } from 'effect'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors, fonts } from 'src/theme'

type ChipVariant = 'filter' | 'input' | 'suggestion'

interface ChipProps {
  label: string
  selected?: boolean
  onPress?: () => void
  icon?: ReactNode
  variant?: ChipVariant
  disabled?: boolean
}

interface VariantStyles {
  paddingHorizontal: number
  paddingVertical: number
  borderRadius: number
}

const getVariantStyles = (variant: ChipVariant): VariantStyles =>
  pipe(
    Match.value(variant),
    Match.when('filter', () => ({
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
    })),
    Match.when('input', () => ({
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
    })),
    Match.when('suggestion', () => ({
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 20,
    })),
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
  const variantStyles = getVariantStyles(variant)
  const backgroundColor = selected ? colors.primary : colors.white
  const textColor = selected ? colors.white : colors.textPrimary
  const borderColor = selected ? colors.primary : '#E0E0E0'

  const content = (
    <View
      className="flex-row items-center"
      style={{
        backgroundColor,
        borderWidth: selected ? 0 : 1,
        borderColor,
        opacity: disabled ? 0.5 : 1,
        gap: 6,
        paddingHorizontal: variantStyles.paddingHorizontal,
        paddingVertical: variantStyles.paddingVertical,
        borderRadius: variantStyles.borderRadius,
      }}
    >
      {icon}
      <Text
        style={{
          color: textColor,
          fontSize: 14,
          fontFamily: fonts.medium,
        }}
      >
        {label}
      </Text>
    </View>
  )

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          opacity: pressed && !disabled ? 0.8 : 1,
        })}
      >
        {content}
      </Pressable>
    )
  }

  return content
}
