import { daysUntilApiDate } from '@lily/shared'
import { String as EffectString, Match, Option, pipe } from 'effect'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { AnimatedMeshGradient } from '@/components/ui/organisms/mesh-gradient'
import { mapApiHealthToCardHealth } from '@/utils/health'

const MESH_COLORS = [
  { r: 0.36, g: 0.55, b: 0.35 },
  { r: 0.42, g: 0.61, b: 0.42 },
  { r: 0.22, g: 0.48, b: 0.45 },
  { r: 0.29, g: 0.49, b: 0.29 },
]

interface PlantShareCardProps {
  plant: {
    name: string
    imageUrl?: string | null
    category?: string | null
    health: string
    dateAdded: Date
    photoCount: number
  }
}

const getHealthLabel = (
  health: 'healthy' | 'attention' | 'critical',
  t: (key: string) => string
): string =>
  pipe(
    Match.value(health),
    Match.when('healthy', () => t('healthBadge.healthy')),
    Match.when('attention', () => t('healthBadge.attention')),
    Match.when('critical', () => t('healthBadge.critical')),
    Match.exhaustive
  )

const computeAgeDays = (dateAdded: Date): number => {
  const days = daysUntilApiDate(dateAdded.toISOString())
  return Option.match(Option.fromNullable(days), {
    onNone: () => 0,
    onSome: (d) => Math.abs(d),
  })
}

export const PlantShareCard = forwardRef<View, PlantShareCardProps>(
  ({ plant }, ref) => {
    const { t } = useTranslation('plants')
    const healthStatus = mapApiHealthToCardHealth(plant.health)
    const healthLabel = getHealthLabel(healthStatus, t)
    const ageDays = computeAgeDays(plant.dateAdded)
    const { width } = useWindowDimensions()

    return (
      <View
        ref={ref}
        className="absolute left-0 w-[360px] h-[640px] overflow-hidden"
        style={{ top: -2000 }}
        pointerEvents="none"
        collapsable={false}
      >
        {/* Mesh gradient background — same as login */}
        <AnimatedMeshGradient
          colors={MESH_COLORS}
          speed={1}
          noise={0.3}
          blur={0.5}
          contrast={1.1}
          style={StyleSheet.absoluteFill}
        />

        {/* Content overlay */}
        <View className="flex-1 items-start justify-center px-8">
          {/* Square plant photo — full width matching text (360 - 2*32px padding) */}
          <View
            className="rounded-3xl overflow-hidden bg-white/10 aspect-square"
            style={{ height: width / 2 - 2 * 32 }}
          >
            {pipe(
              Option.fromNullable(plant.imageUrl),
              Option.match({
                onNone: () => (
                  <View className="flex-1 items-center justify-center">
                    <Text className="text-6xl">🌿</Text>
                  </View>
                ),
                onSome: (url) => (
                  <Image
                    source={{ uri: url }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                ),
              })
            )}
          </View>

          {/* Plant name + category — left aligned */}
          <View className="w-full mt-2">
            <Text
              className="text-5xl font-bold text-white"
              style={{
                fontFamily: 'SpaceGrotesk_700Bold',
                lineHeight: 56,
                letterSpacing: -1.5,
              }}
              numberOfLines={2}
            >
              {EffectString.toUpperCase(plant.name)}
            </Text>
            {pipe(
              Option.fromNullable(plant.category),
              Option.match({
                onNone: () => null,
                onSome: (category) => (
                  <Text
                    className="text-2xl text-white -mt-3"
                    style={{
                      fontFamily: 'SpaceGrotesk_500Medium',
                      letterSpacing: -0.5,
                    }}
                  >
                    {EffectString.toUpperCase(category)}
                  </Text>
                ),
              })
            )}
          </View>

          {/* Info lines — left aligned */}
          <View className="w-full mt-3 gap-0.5">
            <Text
              className="text-sm text-white/70"
              style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
            >
              {'💚 '}
              {EffectString.toUpperCase(healthLabel)}
            </Text>
            <Text
              className="text-sm text-white/70"
              style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
            >
              {'🌱 '}
              {EffectString.toUpperCase(
                t('shareCard.growingFor', { count: ageDays })
              )}
            </Text>
            <Text
              className="text-sm text-white/70"
              style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
            >
              {'📸 '}
              {EffectString.toUpperCase(
                t('shareCard.photos', { count: plant.photoCount })
              )}
              {plant.photoCount === 0 ? ' 😢' : ''}
            </Text>
          </View>

          {/* Bottom bar — catchphrase left, branding right */}
          <View className="absolute bottom-8 left-8 right-8 flex-row items-center justify-between">
            <Text
              className="text-xs text-white/50"
              style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
            >
              {t('shareCard.catchphrase')}
            </Text>
            <Text
              className="text-xs text-white/50"
              style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
            >
              🌿 Lily
            </Text>
          </View>
        </View>
      </View>
    )
  }
)

PlantShareCard.displayName = 'PlantShareCard'
