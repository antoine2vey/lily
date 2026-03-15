import { daysUntilApiDate } from '@lily/shared'
import { Match, Option, pipe } from 'effect'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Text, View } from 'react-native'
import { Badge } from '@/components/Badge'
import { mapApiHealthToCardHealth } from '@/utils/health'

type HealthStatus = 'healthy' | 'attention' | 'critical'

interface PlantShareCardProps {
  plant: {
    name: string
    imageUrl?: string | null
    category?: string | null
    health: string
    dateAdded: Date
  }
}

interface HealthBadgeConfig {
  labelKey: 'healthy' | 'attention' | 'critical'
  variant: 'success' | 'warning' | 'error'
}

const getHealthBadgeConfig = (health: HealthStatus): HealthBadgeConfig =>
  pipe(
    Match.value(health),
    Match.when('healthy', () => ({
      labelKey: 'healthy' as const,
      variant: 'success' as const,
    })),
    Match.when('attention', () => ({
      labelKey: 'attention' as const,
      variant: 'warning' as const,
    })),
    Match.when('critical', () => ({
      labelKey: 'critical' as const,
      variant: 'error' as const,
    })),
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
    const badgeConfig = getHealthBadgeConfig(healthStatus)
    const ageDays = computeAgeDays(plant.dateAdded)

    return (
      <View
        ref={ref}
        className="absolute -top-[1000px] left-0 w-[360px] bg-background rounded-2xl overflow-hidden"
        style={{ opacity: 0 }}
        pointerEvents="none"
        collapsable={false}
      >
        {/* Plant Photo */}
        {pipe(
          Option.fromNullable(plant.imageUrl),
          Option.match({
            onNone: () => (
              <View className="h-[240px] bg-primary-tint items-center justify-center">
                <Text className="text-6xl">🌿</Text>
              </View>
            ),
            onSome: (url) => (
              <Image
                source={{ uri: url }}
                className="w-full h-[240px]"
                resizeMode="cover"
              />
            ),
          })
        )}

        {/* Card Content */}
        <View className="p-5">
          {/* Plant Name */}
          <Text
            className="text-2xl font-bold text-text-primary"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
            numberOfLines={2}
          >
            {plant.name}
          </Text>

          {/* Badges Row */}
          <View className="flex-row items-center gap-2 mt-3">
            {pipe(
              Option.fromNullable(plant.category),
              Option.match({
                onNone: () => null,
                onSome: (category) => (
                  <Badge label={category} variant="neutral" size="sm" />
                ),
              })
            )}
            <Badge
              label={t(`healthBadge.${badgeConfig.labelKey}`)}
              variant={badgeConfig.variant}
              size="sm"
            />
          </View>

          {/* Age */}
          <Text
            className="text-sm text-text-muted mt-3"
            style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          >
            {t('shareCard.growingFor', { count: ageDays })}
          </Text>

          {/* Branding */}
          <View className="flex-row items-center justify-end mt-4 pt-3 border-t border-border">
            <Text
              className="text-xs text-text-muted"
              style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
            >
              🌱 Lily
            </Text>
          </View>
        </View>
      </View>
    )
  }
)

PlantShareCard.displayName = 'PlantShareCard'
