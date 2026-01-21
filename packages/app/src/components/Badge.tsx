import { Match, pipe } from 'effect'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral'
type BadgeSize = 'sm' | 'md'

interface BadgeProps {
  label: string
  variant: BadgeVariant
  size?: BadgeSize
  icon?: ReactNode
}

interface VariantClasses {
  container: string
  text: string
}

const getVariantClasses = (variant: BadgeVariant): VariantClasses =>
  pipe(
    Match.value(variant),
    Match.when('success', () => ({
      container: 'bg-primary-tint',
      text: 'text-primary',
    })),
    Match.when('warning', () => ({
      container: 'bg-amber-100',
      text: 'text-amber-700',
    })),
    Match.when('error', () => ({
      container: 'bg-orange-100',
      text: 'text-coral',
    })),
    Match.when('info', () => ({
      container: 'bg-blue-100',
      text: 'text-blue-500',
    })),
    Match.when('neutral', () => ({
      container: 'bg-slate-100',
      text: 'text-slate-500',
    })),
    Match.exhaustive
  )

const getSizeClasses = (size: BadgeSize): { container: string; text: string } =>
  pipe(
    Match.value(size),
    Match.when('sm', () => ({
      container: 'px-2 py-1',
      text: 'text-[10px]',
    })),
    Match.when('md', () => ({
      container: 'px-3 py-1.5',
      text: 'text-xs',
    })),
    Match.exhaustive
  )

export function Badge({ label, variant, size = 'md', icon }: BadgeProps) {
  const variantClasses = getVariantClasses(variant)
  const sizeClasses = getSizeClasses(size)

  return (
    <View
      className={`flex-row items-center self-start gap-1 rounded-md ${sizeClasses.container} ${variantClasses.container}`}
    >
      {icon}
      <Text
        className={`font-semibold ${sizeClasses.text} ${variantClasses.text}`}
      >
        {label}
      </Text>
    </View>
  )
}
