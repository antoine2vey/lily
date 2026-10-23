import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { GlassCard, GlassLink, Mascot, MascotHero } from '@/components'
import { HERO_MASCOT_SIZE } from '@/components/MascotHero'
import { Button } from '@/components/ui/Button'
import { useIconColors } from '@/hooks/useIconColors'
import { useLocationPermission } from '@/hooks/useLocationPermission'

interface LocationStepProps {
  onNext: (data: {
    weatherEnabled: boolean
    latitude?: number
    longitude?: number
  }) => void
  onSkip: () => void
}

type Weather = 'sunny' | 'rainy'

// One loop of each clip, so the swap lands on a loop boundary.
const WEATHER_SWAP_MS = 5170
const CROSSFADE_MS = 700

const weatherTip = (weather: Weather) =>
  pipe(
    Match.value(weather),
    Match.when('sunny', () => ({
      icon: 'wb-sunny' as const,
      key: 'location.tipSunny',
    })),
    Match.when('rainy', () => ({
      icon: 'umbrella' as const,
      key: 'location.tipRainy',
    })),
    Match.exhaustive
  )

/** Sunbathing and rainy mascots stacked, crossfading as the weather swaps. */
function WeatherMascot({ weather }: { weather: Weather }) {
  const rain = useSharedValue(0)

  useEffect(() => {
    rain.value = withTiming(weather === 'rainy' ? 1 : 0, {
      duration: CROSSFADE_MS,
    })
  }, [weather, rain])

  const sunnyStyle = useAnimatedStyle(() => ({ opacity: 1 - rain.value }))
  const rainyStyle = useAnimatedStyle(() => ({ opacity: rain.value }))

  return (
    <View style={{ width: HERO_MASCOT_SIZE, height: HERO_MASCOT_SIZE }}>
      <Animated.View className="absolute inset-0" style={sunnyStyle}>
        <Mascot animation="sunbathing" size={HERO_MASCOT_SIZE} />
      </Animated.View>
      <Animated.View className="absolute inset-0" style={rainyStyle}>
        <Mascot animation="rainy" size={HERO_MASCOT_SIZE} />
      </Animated.View>
    </View>
  )
}

function WeatherTip({ weather }: { weather: Weather }) {
  const { t } = useTranslation('onboarding')
  const iconColors = useIconColors()
  const tip = weatherTip(weather)

  return (
    <Animated.View
      key={weather}
      entering={FadeIn.duration(CROSSFADE_MS)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="flex-row items-center gap-2 max-w-full mt-5 px-4 py-2.5 rounded-full bg-white/15 border border-white/20"
    >
      <MaterialIcons name={tip.icon} size={18} color={iconColors.white} />
      <Text
        className="text-sm text-white shrink"
        numberOfLines={2}
        style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
      >
        {t(tip.key)}
      </Text>
    </Animated.View>
  )
}

export function LocationStep({ onNext, onSkip }: LocationStepProps) {
  const { t } = useTranslation('onboarding')
  const { loading, requestPermission } = useLocationPermission()
  const [weather, setWeather] = useState<Weather>('sunny')

  useEffect(() => {
    const id = setInterval(() => {
      setWeather((current) => (current === 'sunny' ? 'rainy' : 'sunny'))
    }, WEATHER_SWAP_MS)
    return () => clearInterval(id)
  }, [])

  const handleEnable = async () => {
    const location = await requestPermission()
    if (location) {
      onNext({
        weatherEnabled: true,
        latitude: location.latitude,
        longitude: location.longitude,
      })
    } else {
      onNext({ weatherEnabled: false })
    }
  }

  return (
    <View className="flex-1">
      <MascotHero
        animation="sunbathing"
        mascot={<WeatherMascot weather={weather} />}
        title={t('location.title')}
        subtitle={t('location.subtitle')}
      >
        <WeatherTip weather={weather} />
      </MascotHero>

      <GlassCard>
        <View className="gap-2">
          <Button
            icon="location-on"
            iconPosition="left"
            loading={loading}
            onPress={handleEnable}
            pill
          >
            {t('location.enable')}
          </Button>

          <GlassLink label={t('location.skip')} onPress={onSkip} />
        </View>
      </GlassCard>
    </View>
  )
}
