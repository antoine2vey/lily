import { MaterialIcons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

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
  const iconColors = useIconColors()

  return (
    <Pressable
      onPress={onPress}
      className="mx-4 mb-3 rounded-xl p-4 bg-surface dark:bg-surface-dark border border-border/30 dark:border-slate-700/30 shadow-sm active:bg-surface-tinted dark:active:bg-slate-700"
    >
      <View className="flex-row items-center">
        <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-surface-tinted dark:bg-primary/20">
          {icon}
        </View>
        <Text className="flex-1 text-sm font-bold text-text-secondary dark:text-slate-300">
          {title}
        </Text>
        {badge && <View className="mr-2">{badge}</View>}
        <MaterialIcons
          name="chevron-right"
          size={24}
          color={iconColors.border}
        />
      </View>
    </Pressable>
  )
}
