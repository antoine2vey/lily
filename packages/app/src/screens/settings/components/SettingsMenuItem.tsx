import { MaterialIcons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

interface SettingsMenuItemProps {
  icon: ReactNode
  title: string
  value?: string
  badge?: ReactNode
  showChevron?: boolean
  showBorder?: boolean
  disabled?: boolean
  onPress?: () => void
  testID?: string
}

export function SettingsMenuItem({
  icon,
  title,
  value,
  badge,
  showChevron = true,
  showBorder = false,
  disabled = false,
  onPress,
  testID,
}: SettingsMenuItemProps) {
  const iconColors = useIconColors()

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      className={`flex-row items-center gap-3 p-4 min-h-[64px] active:bg-surface-tinted dark:active:bg-slate-700 ${
        showBorder ? 'border-b border-border/50 dark:border-slate-700/50' : ''
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <View className="w-10 h-10 rounded-full items-center justify-center bg-primary-tint dark:bg-primary/20">
        {icon}
      </View>
      <View className="flex-1">
        <Text className="text-base font-medium text-text-primary dark:text-white">
          {title}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        {value && (
          <Text className="text-sm text-text-muted dark:text-slate-400">
            {value}
          </Text>
        )}
        {badge}
        {showChevron && (
          <MaterialIcons
            name="chevron-right"
            size={20}
            color={iconColors.border}
          />
        )}
      </View>
    </Pressable>
  )
}
