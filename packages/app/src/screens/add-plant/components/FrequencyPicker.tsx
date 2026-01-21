import { Array, pipe } from 'effect'
import type { ReactNode } from 'react'
import { Text, TextInput, View } from 'react-native'
import { Chip } from 'src/components/Chip'
import { iconColors } from 'src/theme'

interface FrequencyPreset {
  days: number
  label: string
}

interface FrequencyPickerProps {
  icon?: ReactNode
  label: string
  value: number
  onValueChange: (days: number) => void
  presets: FrequencyPreset[]
}

export function FrequencyPicker({
  icon,
  label,
  value,
  onValueChange,
  presets,
}: FrequencyPickerProps) {
  const isCustomValue = !pipe(
    presets,
    Array.some((preset) => preset.days === value)
  )

  return (
    <View className="mb-6">
      <View className="flex-row items-center gap-2 mb-3">
        {icon && (
          <View className="w-8 h-8 rounded-full items-center justify-center bg-primary-tint">
            {icon}
          </View>
        )}
        <Text className="text-base font-medium text-text-primary">{label}</Text>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {pipe(
          presets,
          Array.map((preset) => (
            <Chip
              key={preset.days}
              label={preset.label}
              selected={value === preset.days}
              onPress={() => onValueChange(preset.days)}
              variant="input"
            />
          ))
        )}
        <View className="flex-row items-center">
          <TextInput
            className={`w-16 h-9 rounded-lg text-center text-sm font-medium ${
              isCustomValue
                ? 'bg-primary text-white'
                : 'bg-input-bg text-text-primary'
            }`}
            value={isCustomValue ? String(value) : ''}
            onChangeText={(text) => {
              const days = Number.parseInt(text, 10)
              if (!Number.isNaN(days) && days > 0) {
                onValueChange(days)
              }
            }}
            keyboardType="number-pad"
            placeholder="Custom"
            placeholderTextColor={iconColors.textMuted}
          />
          <Text className="text-sm ml-2 font-regular text-text-muted">
            days
          </Text>
        </View>
      </View>
    </View>
  )
}
