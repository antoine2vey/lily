import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors } from 'src/theme'

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
  const getStyles = (pressed: boolean) =>
    pipe(
      Match.value(variant),
      Match.when('primary', () => ({
        text: pressed ? 'opacity-70' : '',
        color: colors.primary,
      })),
      Match.when('secondary', () => ({
        text: pressed ? 'opacity-70' : '',
        color: colors.textMuted,
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
            <Text
              className={`text-sm ${styles.text}`}
              style={{
                fontFamily: 'PlusJakartaSans_600SemiBold',
                color: styles.color,
              }}
            >
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
