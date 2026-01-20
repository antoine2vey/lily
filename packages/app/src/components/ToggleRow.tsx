import type { ReactNode } from 'react'
import { Switch, Text, View } from 'react-native'
import { colors, fonts } from 'src/theme'

interface ToggleRowProps {
  label: string
  description?: string
  value: boolean
  onValueChange: (value: boolean) => void
  icon?: ReactNode
  disabled?: boolean
}

export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  icon,
  disabled = false,
}: ToggleRowProps) {
  return (
    <View
      className="flex-row items-center py-3"
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      {icon && (
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: colors.primaryTint }}
        >
          {icon}
        </View>
      )}
      <View className="flex-1">
        <Text
          className="text-base"
          style={{ fontFamily: fonts.medium, color: colors.textPrimary }}
        >
          {label}
        </Text>
        {description && (
          <Text
            className="text-sm mt-0.5"
            style={{ fontFamily: fonts.regular, color: colors.textMuted }}
          >
            {description}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#E0E0E0', true: colors.primary }}
        thumbColor={colors.white}
        ios_backgroundColor="#E0E0E0"
      />
    </View>
  )
}
