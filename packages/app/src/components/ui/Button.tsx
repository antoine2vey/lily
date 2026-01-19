import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  Text,
  View,
} from 'react-native'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

type ButtonProps = Omit<PressableProps, 'children'> & {
  children: ReactNode
  variant?: ButtonVariant
  icon?: keyof typeof MaterialIcons.glyphMap
  iconPosition?: 'left' | 'right'
  loading?: boolean
  fullWidth?: boolean
}

const getVariantStyles = (variant: ButtonVariant, pressed: boolean) =>
  pipe(
    Match.value(variant),
    Match.when('primary', () => ({
      container: `bg-primary ${pressed ? 'bg-[#729a4a]' : ''} shadow-lg`,
      text: 'text-[#141712]',
      icon: '#141712',
    })),
    Match.when('secondary', () => ({
      container: `bg-transparent border-2 border-zinc-200 dark:border-zinc-700 ${pressed ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`,
      text: 'text-zinc-900 dark:text-white',
      icon: '#141712',
    })),
    Match.when('ghost', () => ({
      container: `bg-transparent ${pressed ? 'opacity-70' : ''}`,
      text: 'text-text-secondary dark:text-zinc-400',
      icon: '#738363',
    })),
    Match.exhaustive
  )

export function Button({
  children,
  variant = 'primary',
  icon,
  iconPosition = 'right',
  loading = false,
  fullWidth = true,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      disabled={disabled || loading}
      className={`
        h-14 rounded-full flex-row items-center justify-center gap-2 px-5
        ${fullWidth ? 'w-full' : ''}
        ${disabled ? 'opacity-50' : ''}
      `}
      style={({ pressed }) => ({
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
      })}
      {...props}
    >
      {({ pressed }) => {
        const styles = getVariantStyles(variant, pressed)
        return (
          <View
            className={`
              h-14 rounded-full flex-row items-center justify-center gap-2 px-5
              ${fullWidth ? 'w-full' : ''}
              ${styles.container}
            `}
          >
            {loading ? (
              <ActivityIndicator
                color={variant === 'primary' ? '#141712' : '#738363'}
              />
            ) : (
              <>
                {icon && iconPosition === 'left' && (
                  <MaterialIcons name={icon} size={20} color={styles.icon} />
                )}
                <Text
                  className={`text-lg font-bold ${styles.text}`}
                  style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
                >
                  {children}
                </Text>
                {icon && iconPosition === 'right' && (
                  <MaterialIcons name={icon} size={20} color={styles.icon} />
                )}
              </>
            )}
          </View>
        )
      }}
    </Pressable>
  )
}
