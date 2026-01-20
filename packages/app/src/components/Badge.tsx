import { Match, pipe } from 'effect'
import type { ReactNode } from 'react'
import { Text, View, type ViewStyle } from 'react-native'
import { fonts } from 'src/theme'

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral'
type BadgeSize = 'sm' | 'md'

interface BadgeProps {
  label: string
  variant: BadgeVariant
  size?: BadgeSize
  icon?: ReactNode
}

interface VariantColors {
  background: string
  text: string
}

const getVariantColors = (variant: BadgeVariant): VariantColors =>
  pipe(
    Match.value(variant),
    Match.when('success', () => ({ background: '#E8F5E8', text: '#5B8C5A' })),
    Match.when('warning', () => ({ background: '#FFF3E0', text: '#F57C00' })),
    Match.when('error', () => ({ background: '#FDECEC', text: '#E8997E' })),
    Match.when('info', () => ({ background: '#E3F2FD', text: '#1976D2' })),
    Match.when('neutral', () => ({ background: '#F5F5F5', text: '#757575' })),
    Match.exhaustive
  )

interface SizeStyles {
  paddingHorizontal: number
  paddingVertical: number
  fontSize: number
}

const getSizeStyles = (size: BadgeSize): SizeStyles =>
  pipe(
    Match.value(size),
    Match.when('sm', () => ({
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontSize: 10,
    })),
    Match.when('md', () => ({
      paddingHorizontal: 12,
      paddingVertical: 6,
      fontSize: 12,
    })),
    Match.exhaustive
  )

export function Badge({ label, variant, size = 'md', icon }: BadgeProps) {
  const variantColors = getVariantColors(variant)
  const sizeStyles = getSizeStyles(size)

  const containerStyle: ViewStyle = {
    backgroundColor: variantColors.background,
    borderRadius: 12,
    paddingHorizontal: sizeStyles.paddingHorizontal,
    paddingVertical: sizeStyles.paddingVertical,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
  }

  return (
    <View style={containerStyle}>
      {icon}
      <Text
        style={{
          color: variantColors.text,
          fontSize: sizeStyles.fontSize,
          fontFamily: fonts.semiBold,
        }}
      >
        {label}
      </Text>
    </View>
  )
}
