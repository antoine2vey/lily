import { MaterialIcons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'
import type { TimeOfDay } from '@/hooks/useOnboardingFlow'

interface PreferencesStepProps {
  onNext: (data: { preferredTime: TimeOfDay }) => void
  onSkip: () => void
}

interface TimeOption {
  value: TimeOfDay
  titleKey: string
  icon: ComponentProps<typeof MaterialIcons>['name']
}

const timeOptions: TimeOption[] = [
  { value: 'morning', titleKey: 'preferences.morning', icon: 'wb-sunny' },
  {
    value: 'afternoon',
    titleKey: 'preferences.afternoon',
    icon: 'wb-cloudy',
  },
  {
    value: 'evening',
    titleKey: 'preferences.evening',
    icon: 'nightlight-round',
  },
]

export function PreferencesStep({ onNext, onSkip }: PreferencesStepProps) {
  const { t } = useTranslation('onboarding')
  const iconColors = useIconColors()
  const [selected, setSelected] = useState<TimeOfDay | null>(null)

  const handleContinue = () => {
    if (selected) {
      onNext({ preferredTime: selected })
    }
  }

  return (
    <View className="flex-1 px-6 pt-12">
      {/* Illustration */}
      <View className="items-center mb-10">
        <View className="w-40 h-40 rounded-3xl items-center justify-center bg-primary-tint dark:bg-slate-800">
          <MaterialIcons name="schedule" size={80} color={iconColors.primary} />
        </View>
      </View>

      <Text
        className="text-2xl font-bold text-text-primary dark:text-white text-center mb-2"
        style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
      >
        {t('preferences.title')}
      </Text>
      <Text className="text-base text-text-secondary dark:text-slate-400 text-center mb-10">
        {t('preferences.subtitle')}
      </Text>

      <View className="gap-3">
        {timeOptions.map((option) => {
          const isSelected = selected === option.value
          return (
            <Pressable
              key={option.value}
              onPress={() => setSelected(option.value)}
              className={`flex-row items-center p-5 rounded-xl border ${
                isSelected
                  ? 'border-primary bg-primary-tint dark:bg-slate-700'
                  : 'border-border dark:border-slate-700 bg-surface dark:bg-slate-800'
              }`}
            >
              <MaterialIcons
                name={option.icon}
                size={24}
                color={isSelected ? iconColors.primary : iconColors.textMuted}
              />
              <Text
                className={`text-base ml-3 ${
                  isSelected
                    ? 'font-semibold text-primary dark:text-primary-light'
                    : 'text-text-primary dark:text-white'
                }`}
                style={{
                  fontFamily: isSelected
                    ? 'SpaceGrotesk_600SemiBold'
                    : 'SpaceGrotesk_400Regular',
                }}
              >
                {t(option.titleKey)}
              </Text>
              {isSelected && (
                <MaterialIcons
                  name="check-circle"
                  size={20}
                  color={iconColors.primary}
                  style={{ marginLeft: 'auto' }}
                />
              )}
            </Pressable>
          )
        })}
      </View>

      <View className="gap-3 mt-auto mb-4">
        <Pressable
          onPress={handleContinue}
          disabled={!selected}
          className={`flex-row items-center justify-center py-4 rounded-full ${
            selected
              ? 'bg-primary active:bg-primary-dark'
              : 'bg-border dark:bg-slate-700'
          }`}
        >
          <Text
            className={`text-base font-semibold ${
              selected ? 'text-white' : 'text-text-muted'
            }`}
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {t('buttons.next')}
          </Text>
        </Pressable>

        <Pressable onPress={onSkip} className="py-3 items-center">
          <Text className="text-sm text-text-muted dark:text-slate-500">
            {t('buttons.skip')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
