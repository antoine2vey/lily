import { MaterialIcons } from '@expo/vector-icons'
import { TEMP_HIGH_C } from '@lily/shared'
import { Match, Option, pipe } from 'effect'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LayoutChangeEvent } from 'react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { AnimatedMeshGradient } from '@/components/ui/organisms/mesh-gradient'
import { useIconColors } from '@/hooks/useIconColors'
import { useTemperatureUnit } from '@/hooks/useTemperatureUnit'
import type { useWeather } from '@/hooks/useWeather'
import { useToggleWeather } from '@/hooks/useWeatherSettings'

type WeatherData = ReturnType<typeof useWeather>

interface WeatherCardProps {
  weather: WeatherData
}

interface ConditionInfo {
  icon: keyof typeof MaterialIcons.glyphMap
  label: string
  tintColor: string
  tintBg: string
  tintBgDark: string
}

// Blue/white mesh colors for the weather card background
const LIGHT_MESH_COLORS = [
  { r: 0.55, g: 0.75, b: 0.95 }, // soft sky blue
  { r: 0.85, g: 0.92, b: 1.0 }, // near-white blue
  { r: 0.4, g: 0.65, b: 0.9 }, // medium blue
  { r: 0.7, g: 0.85, b: 0.98 }, // light blue
]

const DARK_MESH_COLORS = [
  { r: 0.12, g: 0.2, b: 0.35 }, // deep navy
  { r: 0.18, g: 0.28, b: 0.42 }, // slate blue
  { r: 0.08, g: 0.15, b: 0.3 }, // dark blue
  { r: 0.15, g: 0.25, b: 0.4 }, // muted blue
]

export function WeatherCard({ weather }: WeatherCardProps) {
  const { t } = useTranslation('home')
  const iconColors = useIconColors()
  const isDark = iconColors.isDark
  const { formatTemp } = useTemperatureUnit()
  const toggleWeather = useToggleWeather()

  // Error handling
  if (weather.error) {
    const errorTag = pipe(
      Option.fromNullable(
        weather.error !== null &&
          typeof weather.error === 'object' &&
          '_tag' in weather.error
          ? (weather.error as { _tag: string })._tag
          : null
      ),
      Option.getOrElse(() => 'UnknownError')
    )

    // WeatherNotAvailableError (404) → show teaser
    if (errorTag === 'WeatherNotAvailableError') {
      return <TeaserCard onEnable={() => toggleWeather.mutate(true)} />
    }

    // WeatherFetchError (502) → show error card
    if (errorTag === 'WeatherFetchError') {
      return <ErrorCard />
    }

    // Other errors → hide silently
    return null
  }

  // Not enabled → teaser
  if (!weather.weatherEnabled) {
    return <TeaserCard onEnable={() => toggleWeather.mutate(true)} />
  }

  // Loading or no data yet
  if (weather.isLoading || Option.isNone(weather.todayWeather)) {
    return null
  }

  const today = weather.todayWeather.value
  const { adjustmentSummary } = weather

  const condition = getConditionInfo(
    today.precipitation,
    today.cloudCover,
    today.temperatureMax,
    isDark,
    t
  )

  const impactLabel = pipe(
    Match.value(true),
    Match.when(
      () => adjustmentSummary.skipWateringCount > 0,
      () =>
        t('weather.skipWatering', {
          count: adjustmentSummary.skipWateringCount,
        })
    ),
    Match.when(
      () => adjustmentSummary.skipFertilizationCount > 0,
      () =>
        t('weather.skipFertilization', {
          count: adjustmentSummary.skipFertilizationCount,
        })
    ),
    Match.when(
      () => adjustmentSummary.adjustedCount > 0,
      () =>
        t('weather.adjustedPlants', {
          count: adjustmentSummary.adjustedCount,
        })
    ),
    Match.orElse(() => t('weather.noImpact'))
  )

  return (
    <MeshCard isDark={isDark}>
      <View className="flex-row items-center gap-4">
        {/* Condition icon */}
        <View
          className="w-12 h-12 rounded-full items-center justify-center shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}
        >
          <MaterialIcons name={condition.icon} size={24} color="white" />
        </View>

        {/* Temperature + condition */}
        <View className="flex-1 min-w-0">
          <Text className="text-lg font-bold text-white">
            {formatTemp(today.temperatureMean)}
          </Text>
          <Text
            className="text-xs font-medium"
            style={{ color: 'rgba(255,255,255,0.75)' }}
          >
            {condition.label}
          </Text>
        </View>

        {/* Care impact badge */}
        <View
          className="px-2.5 py-1 rounded-full shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
        >
          <Text className="text-xs font-bold text-white">{impactLabel}</Text>
        </View>
      </View>
    </MeshCard>
  )
}

/**
 * Card wrapper with animated mesh gradient background.
 * Uses onLayout to measure the card, then sizes the Skia canvas to match.
 */
function MeshCard({
  isDark,
  children,
}: {
  isDark: boolean
  children: React.ReactNode
}) {
  const [size, setSize] = useState({ width: 0, height: 0 })

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize({ width, height })
  }, [])

  return (
    <View
      onLayout={onLayout}
      className="rounded-[24px] mb-4 overflow-hidden"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.2 : 0.06,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {size.width > 0 && (
        <AnimatedMeshGradient
          colors={isDark ? DARK_MESH_COLORS : LIGHT_MESH_COLORS}
          speed={0.5}
          noise={0.2}
          blur={0.5}
          contrast={1.05}
          width={size.width}
          height={size.height}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View className="p-4">{children}</View>
    </View>
  )
}

function getConditionInfo(
  precipitation: number | null,
  cloudCover: number | null,
  temperatureMax: number | null,
  isDark: boolean,
  t: (key: string) => string
): ConditionInfo {
  return pipe(
    Match.value(true),
    Match.when(
      () => precipitation !== null && precipitation > 0,
      () => ({
        icon: 'grain' as const,
        label: t('weather.conditionRainy'),
        tintColor: '#60A5FA',
        tintBg: '#DBEAFE',
        tintBgDark: 'rgba(96,165,250,0.15)',
      })
    ),
    Match.when(
      () => cloudCover !== null && cloudCover > 70,
      () => ({
        icon: 'cloud' as const,
        label: t('weather.conditionCloudy'),
        tintColor: isDark ? '#9CA3AF' : '#6B7280',
        tintBg: '#F1F5F9',
        tintBgDark: 'rgba(156,163,175,0.15)',
      })
    ),
    Match.when(
      () => temperatureMax !== null && temperatureMax > TEMP_HIGH_C,
      () => ({
        icon: 'wb-sunny' as const,
        label: t('weather.conditionHot'),
        tintColor: '#F59E0B',
        tintBg: '#FEF3C7',
        tintBgDark: 'rgba(245,158,11,0.15)',
      })
    ),
    Match.orElse(() => ({
      icon: 'wb-sunny' as const,
      label: t('weather.conditionSunny'),
      tintColor: '#FBBF24',
      tintBg: '#FEF9C3',
      tintBgDark: 'rgba(251,191,36,0.15)',
    }))
  )
}

function TeaserCard({ onEnable }: { onEnable: () => void }) {
  const { t } = useTranslation('home')
  const iconColors = useIconColors()
  const isDark = iconColors.isDark

  return (
    <View
      className="rounded-[24px] p-4 mb-4 bg-surface dark:bg-surface-dark"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.2 : 0.06,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      <View className="flex-row items-center gap-4">
        <View
          className="w-12 h-12 rounded-full items-center justify-center shrink-0"
          style={{
            backgroundColor: isDark ? 'rgba(251,191,36,0.15)' : '#FEF9C3',
          }}
        >
          <MaterialIcons name="wb-sunny" size={24} color="#FBBF24" />
        </View>

        <View className="flex-1 min-w-0">
          <Text className="text-sm font-bold text-text-primary dark:text-white">
            {t('weather.enableTitle')}
          </Text>
          <Text className="text-xs font-medium text-text-muted mt-0.5">
            {t('weather.enableSubtitle')}
          </Text>
        </View>

        <Pressable
          onPress={onEnable}
          className="px-3 py-1.5 rounded-full bg-primary active:bg-primary-dark shrink-0"
        >
          <Text className="text-xs font-bold text-white">
            {t('weather.enableButton')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function ErrorCard() {
  const { t } = useTranslation('home')
  const iconColors = useIconColors()
  const isDark = iconColors.isDark

  return (
    <View
      className="rounded-[24px] p-4 mb-4 bg-surface dark:bg-surface-dark"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.2 : 0.06,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      <View className="flex-row items-center gap-4">
        <View
          className="w-12 h-12 rounded-full items-center justify-center shrink-0"
          style={{
            backgroundColor: isDark ? 'rgba(156,163,175,0.15)' : '#F1F5F9',
          }}
        >
          <MaterialIcons
            name="cloud-off"
            size={24}
            color={iconColors.textMuted}
          />
        </View>

        <Text className="flex-1 text-sm font-medium text-text-muted">
          {t('weather.fetchError')}
        </Text>
      </View>
    </View>
  )
}
