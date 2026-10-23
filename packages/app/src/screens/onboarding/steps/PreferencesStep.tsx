import type { MaterialIcons } from '@expo/vector-icons'
import { Array as Arr } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { GlassCard, GlassLink, GlassOption, MascotHero } from '@/components'
import type { MeshTint } from '@/components/MeshBackground'
import { Button } from '@/components/ui/Button'
import type { TimeOfDay } from '@/hooks/useOnboardingFlow'

interface PreferencesStepProps {
  onNext: (data: { preferredTime: TimeOfDay }) => void
  onSkip: () => void
  /** Called on each pick so the screen can tint the background. */
  onSelectTime: (time: TimeOfDay) => void
}

interface TimeOption {
  value: TimeOfDay
  titleKey: string
  icon: keyof typeof MaterialIcons.glyphMap
}

const timeOptions: TimeOption[] = [
  { value: 'morning', titleKey: 'preferences.morning', icon: 'wb-twilight' },
  { value: 'afternoon', titleKey: 'preferences.afternoon', icon: 'wb-sunny' },
  { value: 'evening', titleKey: 'preferences.evening', icon: 'nights-stay' },
]

/** Background colors per time of day: still green, shifted toward dawn, noon or dusk. */
export const TIME_OF_DAY_TINTS: Record<TimeOfDay, MeshTint> = {
  morning: {
    id: 'morning',
    light: [
      { r: 0.42, g: 0.6, b: 0.36 },
      { r: 0.8, g: 0.66, b: 0.36 },
      { r: 0.3, g: 0.54, b: 0.42 },
      { r: 0.52, g: 0.62, b: 0.34 },
    ],
    dark: [
      { r: 0.14, g: 0.24, b: 0.14 },
      { r: 0.36, g: 0.27, b: 0.12 },
      { r: 0.1, g: 0.22, b: 0.18 },
      { r: 0.2, g: 0.26, b: 0.12 },
    ],
  },
  afternoon: {
    id: 'afternoon',
    light: [
      { r: 0.44, g: 0.66, b: 0.38 },
      { r: 0.58, g: 0.72, b: 0.4 },
      { r: 0.28, g: 0.58, b: 0.52 },
      { r: 0.38, g: 0.62, b: 0.34 },
    ],
    dark: [
      { r: 0.16, g: 0.3, b: 0.16 },
      { r: 0.22, g: 0.34, b: 0.16 },
      { r: 0.1, g: 0.28, b: 0.26 },
      { r: 0.14, g: 0.28, b: 0.14 },
    ],
  },
  evening: {
    id: 'evening',
    light: [
      { r: 0.24, g: 0.4, b: 0.32 },
      { r: 0.62, g: 0.4, b: 0.32 },
      { r: 0.18, g: 0.32, b: 0.4 },
      { r: 0.28, g: 0.42, b: 0.3 },
    ],
    dark: [
      { r: 0.08, g: 0.16, b: 0.12 },
      { r: 0.26, g: 0.14, b: 0.1 },
      { r: 0.06, g: 0.13, b: 0.18 },
      { r: 0.1, g: 0.18, b: 0.12 },
    ],
  },
}

export function PreferencesStep({
  onNext,
  onSkip,
  onSelectTime,
}: PreferencesStepProps) {
  const { t } = useTranslation('onboarding')
  const [selected, setSelected] = useState<TimeOfDay | null>(null)

  const handleContinue = () => {
    if (selected) {
      onNext({ preferredTime: selected })
    }
  }

  return (
    <View className="flex-1">
      <MascotHero
        animation="sunbathing"
        title={t('preferences.title')}
        subtitle={t('preferences.subtitle')}
      />

      <GlassCard padding="sm">
        <View className="gap-3">
          {Arr.map(timeOptions, (option) => (
            <GlassOption
              key={option.value}
              icon={option.icon}
              title={t(option.titleKey)}
              selected={selected === option.value}
              onPress={() => {
                setSelected(option.value)
                onSelectTime(option.value)
              }}
            />
          ))}
        </View>

        <View className="gap-1">
          <Button onPress={handleContinue} disabled={!selected} pill>
            {t('buttons.next')}
          </Button>
          <GlassLink label={t('buttons.skip')} onPress={onSkip} />
        </View>
      </GlassCard>
    </View>
  )
}
