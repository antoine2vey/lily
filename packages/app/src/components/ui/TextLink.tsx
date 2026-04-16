import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

type TextLinkVariant = 'primary' | 'secondary'

type TextLinkProps = {
  children: ReactNode
  variant?: TextLinkVariant
  icon?: keyof typeof MaterialIcons.glyphMap
  iconPosition?: 'left' | 'right'
  onPress?: () => void
  disabled?: boolean
}

export function TextLink({
  children,
  variant = 'primary',
  icon,
  iconPosition = 'right',
  onPress,
  disabled,
}: TextLinkProps) {
  const iconColors = useIconColors()

  const getStyles = (pressed: boolean) =>
    pipe(
      Match.value(variant),
      Match.when('primary', () => ({
        textClass: `text-primary ${pressed ? 'opacity-70' : ''}`,
        color: iconColors.primary,
      })),
      Match.when('secondary', () => ({
        textClass: `text-text-muted ${pressed ? 'opacity-70' : ''}`,
        color: iconColors.muted,
      })),
      Match.exhaustive
    )

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={disabled ? 'opacity-50' : ''}
    >
      {({ pressed }) => {
        const styles = getStyles(pressed)
        return (
          <View className="flex-row items-center gap-1.5">
            {icon && iconPosition === 'left' && (
              <MaterialIcons name={icon} size={18} color={styles.color} />
            )}
            <Text className={`text-sm font-semibold ${styles.textClass}`}>
              {children}
            </Text>
            {icon && iconPosition === 'right' && (
              <MaterialIcons name={icon} size={18} color={styles.color} />
            )}
          </View>
        )
      }}
    </Pressable>
  )
}
