import { MaterialIcons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors, fonts } from 'src/theme'

interface ListRowProps {
  title: string
  subtitle?: string
  leftIcon?: ReactNode
  rightElement?: ReactNode
  onPress?: () => void
  showChevron?: boolean
  destructive?: boolean
}

export function ListRow({
  title,
  subtitle,
  leftIcon,
  rightElement,
  onPress,
  showChevron = false,
  destructive = false,
}: ListRowProps) {
  const content = (
    <View className="flex-row items-center min-h-[56px] py-2">
      {leftIcon && (
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: colors.primaryTint }}
        >
          {leftIcon}
        </View>
      )}
      <View className="flex-1">
        <Text
          className="text-base"
          style={{
            fontFamily: fonts.medium,
            color: destructive ? colors.coral : colors.textPrimary,
          }}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            className="text-sm mt-0.5"
            style={{ fontFamily: fonts.regular, color: colors.textMuted }}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {rightElement}
      {showChevron && (
        <MaterialIcons
          name="chevron-right"
          size={20}
          color={colors.textMuted}
        />
      )}
    </View>
  )

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          opacity: pressed ? 0.7 : 1,
          backgroundColor: pressed ? 'rgba(0,0,0,0.02)' : 'transparent',
        })}
      >
        {content}
      </Pressable>
    )
  }

  return content
}
