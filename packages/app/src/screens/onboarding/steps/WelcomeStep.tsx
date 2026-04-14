import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { useAuth } from '@/contexts/AuthContext'
import { useIconColors } from '@/hooks/useIconColors'
import type { ExperienceLevel } from '@/hooks/useOnboardingFlow'

interface WelcomeStepProps {
  onNext: (data: { experienceLevel: ExperienceLevel }) => void
  onSkipOnboarding: () => void
}

interface LevelOption {
  level: ExperienceLevel
  titleKey: string
  descKey: string
  icon: ComponentProps<typeof MaterialIcons>['name']
}

const levels: LevelOption[] = [
  {
    level: 'beginner',
    titleKey: 'welcome.beginner',
    descKey: 'welcome.beginnerDesc',
    icon: 'eco',
  },
  {
    level: 'intermediate',
    titleKey: 'welcome.intermediate',
    descKey: 'welcome.intermediateDesc',
    icon: 'yard',
  },
  {
    level: 'expert',
    titleKey: 'welcome.expert',
    descKey: 'welcome.expertDesc',
    icon: 'forest',
  },
]

export function WelcomeStep({ onNext, onSkipOnboarding }: WelcomeStepProps) {
  const { t } = useTranslation('onboarding')
  const iconColors = useIconColors()
  const { state } = useAuth()

  const userName = pipe(
    Match.value(state),
    Match.when({ _tag: 'Authenticated' }, (s) => s.user.name ?? ''),
    Match.orElse(() => '')
  )

  return (
    <View className="flex-1 px-6 pt-12">
      <Text
        className="text-2xl font-bold text-text-primary dark:text-white text-center mb-2"
        style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
      >
        {t('welcome.greeting', { name: userName })}
      </Text>
      <Text className="text-base text-text-secondary dark:text-slate-400 text-center mb-10">
        {t('welcome.subtitle')}
      </Text>

      <View className="gap-4">
        {levels.map((option) => (
          <Pressable
            key={option.level}
            onPress={() => onNext({ experienceLevel: option.level })}
            className="flex-row items-center p-5 rounded-xl bg-surface dark:bg-slate-800 active:bg-surface-tinted dark:active:bg-slate-700"
          >
            <View className="w-12 h-12 rounded-full bg-primary-tint dark:bg-slate-700 items-center justify-center mr-4">
              <MaterialIcons
                name={option.icon}
                size={24}
                color={iconColors.primary}
              />
            </View>
            <View className="flex-1">
              <Text
                className="text-base font-semibold text-text-primary dark:text-white"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              >
                {t(option.titleKey)}
              </Text>
              <Text className="text-sm text-text-secondary dark:text-slate-400 mt-0.5">
                {t(option.descKey)}
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={20}
              color={iconColors.textMuted}
            />
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={onSkipOnboarding}
        className="mt-auto mb-4 py-3 items-center"
      >
        <Text className="text-sm text-text-muted dark:text-slate-500 underline">
          {t('welcome.skipOnboarding')}
        </Text>
      </Pressable>
    </View>
  )
}
