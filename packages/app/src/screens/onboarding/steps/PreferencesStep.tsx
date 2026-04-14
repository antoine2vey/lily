import { Array as Arr } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { Button } from '@/components/ui/Button'
import type { TimeOfDay } from '@/hooks/useOnboardingFlow'
import { GlassCard } from '../components/GlassCard'
import { OnboardingHero } from '../components/OnboardingHero'

interface PreferencesStepProps {
  onNext: (data: { preferredTime: TimeOfDay }) => void
  onSkip: () => void
}

interface TimeOption {
  value: TimeOfDay
  titleKey: string
  emoji: string
}

const timeOptions: TimeOption[] = [
  { value: 'morning', titleKey: 'preferences.morning', emoji: '🌅' },
  { value: 'afternoon', titleKey: 'preferences.afternoon', emoji: '☀️' },
  { value: 'evening', titleKey: 'preferences.evening', emoji: '🌙' },
]

export function PreferencesStep({ onNext, onSkip }: PreferencesStepProps) {
  const { t } = useTranslation('onboarding')
  const [selected, setSelected] = useState<TimeOfDay | null>(null)

  const handleContinue = () => {
    if (selected) {
      onNext({ preferredTime: selected })
    }
  }

  return (
    <View className="flex-1">
      <OnboardingHero
        emoji="⏰"
        title={t('preferences.title')}
        subtitle={t('preferences.subtitle')}
      />

      <GlassCard padding="sm">
        <View className="gap-3 mb-4">
          {Arr.map(timeOptions, (option) => {
            const isSelected = selected === option.value
            return (
              <Pressable
                key={option.value}
                onPress={() => setSelected(option.value)}
                className={`flex-row items-center p-4 rounded-2xl ${
                  isSelected ? 'bg-white/25' : 'bg-white/10'
                }`}
              >
                <Text className="text-2xl mr-3">{option.emoji}</Text>
                <Text
                  className={`text-base ${isSelected ? 'text-white' : 'text-white/70'}`}
                  style={{
                    fontFamily: isSelected
                      ? 'SpaceGrotesk_600SemiBold'
                      : 'SpaceGrotesk_400Regular',
                  }}
                >
                  {t(option.titleKey)}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <Button onPress={handleContinue} disabled={!selected} pill>
          {t('buttons.next')}
        </Button>

        <Pressable onPress={onSkip} className="mt-3 py-2 items-center">
          <Text
            className="text-sm text-white/40"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            {t('buttons.skip')}
          </Text>
        </Pressable>
      </GlassCard>
    </View>
  )
}
