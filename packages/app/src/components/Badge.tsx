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
      container: 'bg-primary-tint dark:bg-primary/20',
      text: 'text-primary dark:text-primary-light',
    })),
    Match.when('warning', () => ({
      container: 'bg-amber-100 dark:bg-amber-700/20',
      text: 'text-amber-700 dark:text-amber-400',
    })),
    Match.when('error', () => ({
      container: 'bg-orange-100 dark:bg-orange-900/20',
      text: 'text-coral dark:text-orange-400',
    })),
    Match.when('info', () => ({
      container: 'bg-blue-100 dark:bg-blue-900/20',
      text: 'text-blue-500 dark:text-blue-400',
    })),
    Match.when('neutral', () => ({
      container: 'bg-slate-100 dark:bg-slate-700',
      text: 'text-slate-500 dark:text-slate-300',
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
