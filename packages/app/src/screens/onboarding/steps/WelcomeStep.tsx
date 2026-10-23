import type { MaterialIcons } from '@expo/vector-icons'
import { Array as Arr, Match, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { GlassCard, GlassLink, GlassOption, MascotHero } from '@/components'
import { useAuth } from '@/contexts/AuthContext'
import type { ExperienceLevel } from '@/hooks/useOnboardingFlow'

interface WelcomeStepProps {
  onNext: (data: { experienceLevel: ExperienceLevel }) => void
  onSkipOnboarding: () => void
}

interface LevelOption {
  level: ExperienceLevel
  titleKey: string
  descKey: string
  icon: keyof typeof MaterialIcons.glyphMap
}

const levels: LevelOption[] = [
  {
    level: 'beginner',
    titleKey: 'welcome.beginner',
    descKey: 'welcome.beginnerDesc',
    icon: 'spa',
  },
  {
    level: 'intermediate',
    titleKey: 'welcome.intermediate',
    descKey: 'welcome.intermediateDesc',
    icon: 'local-florist',
  },
  {
    level: 'expert',
    titleKey: 'welcome.expert',
    descKey: 'welcome.expertDesc',
    icon: 'park',
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
      <MascotHero
        animation="hello"
        title={t('welcome.greeting', { name: userName })}
        subtitle={t('welcome.subtitle')}
      />

      <GlassCard padding="sm">
        <View className="gap-3">
          {Arr.map(levels, (option) => (
            <GlassOption
              key={option.level}
              testID={`onboarding-level-${option.level}`}
              icon={option.icon}
              title={t(option.titleKey)}
              description={t(option.descKey)}
              onPress={() => onNext({ experienceLevel: option.level })}
            />
          ))}
        </View>

        <GlassLink
          testID="onboarding-skip-button"
          label={t('welcome.skipOnboarding')}
          onPress={onSkipOnboarding}
        />
      </GlassCard>
    </View>
  )
}
