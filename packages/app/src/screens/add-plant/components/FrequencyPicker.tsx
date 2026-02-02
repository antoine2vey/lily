import { Array, pipe } from 'effect'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

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
  const { t } = useTranslation('addPlant')
  const [inputText, setInputText] = useState(String(value))
  const iconColors = useIconColors()

  // Sync input text when value changes from outside (e.g., preset selection)
  useEffect(() => {
    setInputText(String(value))
  }, [value])
  return (
    <View className="gap-4">
      {/* Section Header - Outside the card */}
      <View className="flex-row items-center gap-2">
        {icon}
        <Text className="text-lg font-bold text-text-primary dark:text-white">
          {label}
        </Text>
      </View>

      {/* Card */}
      <View className="bg-white dark:bg-surface-dark p-5 rounded-xl shadow-sm border border-border dark:border-slate-700 gap-4">
        {/* Input Field */}
        <View className="gap-2">
          <Text className="text-sm font-medium text-primary">
            {t('schedule.frequencyLabel')}
          </Text>
          <View className="relative">
            <TextInput
              className="w-full h-14 pl-4 pr-14 rounded-xl border border-border dark:border-slate-700 bg-background dark:bg-slate-800 text-lg font-semibold text-text-primary dark:text-white"
              value={inputText}
              onChangeText={(text) => {
                // Allow empty string for clearing
                setInputText(text)
                // Only update parent when there's a valid number
                const days = Number.parseInt(text, 10)
                if (!Number.isNaN(days) && days > 0) {
                  onValueChange(days)
                }
              }}
              onBlur={() => {
                // On blur, if empty or invalid, reset to last valid value
                const days = Number.parseInt(inputText, 10)
                if (Number.isNaN(days) || days <= 0) {
                  setInputText(String(value))
                }
              }}
              keyboardType="number-pad"
              placeholder="7"
              placeholderTextColor={iconColors.textMuted}
            />
            <View className="absolute right-4 top-0 bottom-0 justify-center">
              <Text className="text-sm font-medium text-primary">
                {t('schedule.frequencyUnit')}
              </Text>
            </View>
          </View>
        </View>

        {/* Preset Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
        >
          {pipe(
            presets,
            Array.map((preset) => {
              const isSelected = value === preset.days
              return (
                <Pressable
                  key={preset.days}
                  onPress={() => onValueChange(preset.days)}
                  className={`h-9 px-4 rounded-full items-center justify-center ${
                    isSelected
                      ? 'bg-primary'
                      : 'bg-background dark:bg-slate-800 border border-border dark:border-slate-700'
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      isSelected
                        ? 'font-bold text-white'
                        : 'font-medium text-text-primary dark:text-white'
                    }`}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              )
            })
          )}
        </ScrollView>
      </View>
    </View>
  )
}
