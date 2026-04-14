import { Array as Arr, Match, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { useAuth } from '@/contexts/AuthContext'
import type { ExperienceLevel } from '@/hooks/useOnboardingFlow'
import { GlassCard } from '../components/GlassCard'
import { OnboardingHero } from '../components/OnboardingHero'

interface WelcomeStepProps {
  onNext: (data: { experienceLevel: ExperienceLevel }) => void
  onSkipOnboarding: () => void
}

interface LevelOption {
  level: ExperienceLevel
  titleKey: string
  descKey: string
  emoji: string
}

const levels: LevelOption[] = [
  {
    level: 'beginner',
    titleKey: 'welcome.beginner',
    descKey: 'welcome.beginnerDesc',
    emoji: '🌱',
  },
  {
    level: 'intermediate',
    titleKey: 'welcome.intermediate',
    descKey: 'welcome.intermediateDesc',
    emoji: '🪴',
  },
  {
    level: 'expert',
    titleKey: 'welcome.expert',
    descKey: 'welcome.expertDesc',
    emoji: '🌳',
  },
]

export function WelcomeStep({ onNext, onSkipOnboarding }: WelcomeStepProps) {
  const { t } = useTranslation('onboarding')
  const { state } = useAuth()

  const userName = pipe(
    Match.value(state),
    Match.when({ _tag: 'Authenticated' }, (s) => s.user.name ?? ''),
    Match.orElse(() => '')
  )

  return (
    <View className="flex-1">
      <OnboardingHero
        emoji="🌿"
        title={t('welcome.greeting', { name: userName })}
        subtitle={t('welcome.subtitle')}
      />

      <GlassCard padding="sm">
        <View className="gap-3">
          {Arr.map(levels, (option) => (
            <Pressable
              key={option.level}
              onPress={() => onNext({ experienceLevel: option.level })}
              className="flex-row items-center p-4 rounded-2xl bg-white/10 active:bg-white/20"
            >
              <Text className="text-2xl mr-3">{option.emoji}</Text>
              <View className="flex-1">
                <Text
                  className="text-base text-white"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                >
                  {t(option.titleKey)}
                </Text>
                <Text
                  className="text-sm text-white/60 mt-0.5"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                >
                  {t(option.descKey)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={onSkipOnboarding}
          className="mt-4 py-2 items-center"
        >
          <Text
            className="text-sm text-white/40"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            {t('welcome.skipOnboarding')}
          </Text>
        </Pressable>
      </GlassCard>
    </View>
  )
}
