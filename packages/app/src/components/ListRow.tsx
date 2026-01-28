import { MaterialIcons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { iconColors } from 'src/theme'

interface ListRowProps {
  title: string
  subtitle?: string
  leftIcon?: ReactNode
  rightElement?: ReactNode
  onPress?: () => void
  showChevron?: boolean
  destructive?: boolean
  disabled?: boolean
}

export function ListRow({
  title,
  subtitle,
  leftIcon,
  rightElement,
  onPress,
  showChevron = false,
  destructive = false,
  disabled = false,
}: ListRowProps) {
  const titleColorClass = disabled
    ? 'text-text-muted'
    : destructive
      ? 'text-coral'
      : 'text-text-primary'

  const content = (
    <View className="flex-row items-center min-h-[56px] py-2">
      {leftIcon && (
        <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-primary-tint">
          {leftIcon}
        </View>
      )}
      <View className="flex-1">
        <Text className={`text-base font-medium ${titleColorClass}`}>
          {title}
        </Text>
        {subtitle && (
          <Text className="text-sm mt-0.5 text-text-muted font-regular">
            {subtitle}
          </Text>
        )}
      </View>
      {rightElement}
      {showChevron && (
        <MaterialIcons
          name="chevron-right"
          size={20}
          color={iconColors.muted}
        />
      )}
    </View>
  )

  if (onPress && !disabled) {
    return (
      <Pressable
        onPress={onPress}
        className="active:opacity-70 active:bg-black/5"
      >
        {content}
      </Pressable>
    )
  }

  return content
}
