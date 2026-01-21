import { MaterialIcons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { iconColors } from 'src/theme'

interface ProfileMenuItemProps {
  icon: ReactNode
  title: string
  badge?: ReactNode
  onPress: () => void
}

export function ProfileMenuItem({
  icon,
  title,
  badge,
  onPress,
}: ProfileMenuItemProps) {
  return (
    <Pressable
      onPress={onPress}
      className="mx-4 mb-3 rounded-2xl px-4 py-4 bg-surface active:bg-surface-tinted"
    >
      <View className="flex-row items-center">
        <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-surface-tinted">
          {icon}
        </View>
        <Text className="flex-1 text-base font-medium text-text-primary">
          {title}
        </Text>
        {badge && <View className="mr-2">{badge}</View>}
        <MaterialIcons
          name="chevron-right"
          size={24}
          color={iconColors.muted}
        />
      </View>
    </Pressable>
  )
}
