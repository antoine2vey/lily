import type { ReactNode } from 'react'
import { Switch, Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

interface ToggleRowProps {
  label: string
  description?: string
  value: boolean
  onValueChange: (value: boolean) => void
  icon?: ReactNode
  disabled?: boolean
  showBorder?: boolean
  testID?: string
}

export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  icon,
  disabled = false,
  showBorder = false,
  testID,
}: ToggleRowProps) {
  const iconColors = useIconColors()
  const opacityClass = disabled ? 'opacity-50' : ''

  return (
    <View
      className={`flex-row items-center p-4 ${opacityClass} ${
        showBorder ? 'border-b border-border/50 dark:border-slate-700/50' : ''
      }`}
    >
      {icon && (
        <View className="w-10 h-10 rounded-xl items-center justify-center mr-3 bg-primary-tint dark:bg-primary/20">
          {icon}
        </View>
      )}
      <View className="flex-1">
        <Text className="text-base text-text-primary dark:text-white font-medium">
          {label}
        </Text>
        {description && (
          <Text className="text-xs mt-0.5 text-text-muted dark:text-slate-400 font-regular">
            {description}
          </Text>
        )}
      </View>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: iconColors.border, true: iconColors.primary }}
        thumbColor={iconColors.white}
        ios_backgroundColor={iconColors.border}
      />
    </View>
  )
}
