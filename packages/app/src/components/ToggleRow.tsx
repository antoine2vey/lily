import type { ReactNode } from 'react'
import { Switch, Text, View } from 'react-native'
import { iconColors } from 'src/theme'

interface ToggleRowProps {
  label: string
  description?: string
  value: boolean
  onValueChange: (value: boolean) => void
  icon?: ReactNode
  disabled?: boolean
  testID?: string
}

export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  icon,
  disabled = false,
  testID,
}: ToggleRowProps) {
  const opacityClass = disabled ? 'opacity-50' : ''

  return (
    <View className={`flex-row items-center py-3 ${opacityClass}`}>
      {icon && (
        <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-primary-tint">
          {icon}
        </View>
      )}
      <View className="flex-1">
        <Text className="text-base text-text-primary font-medium">{label}</Text>
        {description && (
          <Text className="text-sm mt-0.5 text-text-muted font-regular">
            {description}
          </Text>
        )}
      </View>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#E0E0E0', true: iconColors.primary }}
        thumbColor={iconColors.white}
        ios_backgroundColor="#E0E0E0"
      />
    </View>
  )
}
