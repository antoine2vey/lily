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
import { useIconColors } from 'src/hooks/useIconColors'

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost'

type ButtonProps = Omit<PressableProps, 'children'> & {
  children: ReactNode
  variant?: ButtonVariant
  icon?: keyof typeof MaterialIcons.glyphMap
  iconPosition?: 'left' | 'right'
  loading?: boolean
  fullWidth?: boolean
  pill?: boolean
}

type IconColors = ReturnType<typeof useIconColors>

function getVariantStyles(
  variant: ButtonVariant,
  pressed: boolean,
  iconColors: IconColors
) {
  return pipe(
    Match.value(variant),
    Match.when('primary', () => ({
      container: pressed ? 'bg-primary-dark' : 'bg-primary',
      text: 'text-white',
      iconColor: iconColors.white,
      loaderColor: iconColors.white,
    })),
    Match.when('secondary', () => ({
      container: `border border-primary bg-transparent ${pressed ? 'bg-primary/10' : ''}`,
      text: 'text-primary',
      iconColor: iconColors.primary,
      loaderColor: iconColors.primary,
    })),
    Match.when('destructive', () => ({
      container: pressed ? 'bg-coral-dark' : 'bg-coral',
      text: 'text-white',
      iconColor: iconColors.white,
      loaderColor: iconColors.white,
    })),
    Match.when('ghost', () => ({
      container: `bg-transparent ${pressed ? 'opacity-70' : ''}`,
      text: 'text-primary',
      iconColor: iconColors.primary,
      loaderColor: iconColors.primary,
    })),
    Match.exhaustive
  )
}

export function Button({
  children,
  variant = 'primary',
  icon,
  iconPosition = 'right',
  loading = false,
  fullWidth = true,
  pill = false,
  disabled,
  ...props
}: ButtonProps) {
  const iconColors = useIconColors()

  return (
    <Pressable
      disabled={disabled || loading}
      className={`${fullWidth ? 'w-full' : ''} ${disabled ? 'opacity-50' : ''}`}
      style={({ pressed }) => ({
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
      })}
      {...props}
    >
      {({ pressed }) => {
        const styles = getVariantStyles(variant, pressed, iconColors)
        return (
          <View
            className={`
              h-14 ${pill ? 'rounded-full' : 'rounded-xl'} flex-row items-center justify-center gap-2 px-8
              ${fullWidth ? 'w-full' : ''}
              ${styles.container}
            `}
          >
            {loading ? (
              <ActivityIndicator color={styles.loaderColor} />
            ) : (
              <>
                {icon && iconPosition === 'left' && (
                  <MaterialIcons
                    name={icon}
                    size={20}
                    color={styles.iconColor}
                  />
                )}
                <Text className={`text-base font-semibold ${styles.text}`}>
                  {children}
                </Text>
                {icon && iconPosition === 'right' && (
                  <MaterialIcons
                    name={icon}
                    size={20}
                    color={styles.iconColor}
                  />
                )}
              </>
            )}
          </View>
        )
      }}
    </Pressable>
  )
}
