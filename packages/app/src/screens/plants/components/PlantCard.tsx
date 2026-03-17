import { MaterialIcons } from '@expo/vector-icons'
import type { CareType, PlantOwnership } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import type { TFunction } from 'i18next'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { AnimatedImage } from 'src/components/AnimatedImage'
import { useIconColors } from 'src/hooks/useIconColors'

export type HealthStatus = 'healthy' | 'attention' | 'critical'

export interface CareStatus {
  daysUntil?: number
  isOverdue: boolean
}

interface PlantCardProps {
  plant: {
    id: string
    name: string
    imageUrl?: string
    health: HealthStatus
    watering: CareStatus
    fertilization: CareStatus
    misting: CareStatus
    repotting: CareStatus
    isFavorite?: boolean
    roomName?: string
    roomIcon?: string
    ownership?: PlantOwnership
    ownerName?: string
  }
  onPress: (plantId: string) => void
}

export const MAX_VISIBLE_DAYS = 14

const getHealthDotClass = (health: HealthStatus): string =>
  pipe(
    Match.value(health),
    Match.when('healthy', () => 'bg-primary'),
    Match.when('attention', () => 'bg-orange-400'),
    Match.when('critical', () => 'bg-red-400'),
    Match.exhaustive
  )

export interface CareIndicator {
  type: CareType
  text: string
  daysUntil: number | undefined
  isUrgent: boolean
  isOverdue: boolean
  isToday: boolean
  icon: 'water-drop' | 'spa' | 'grain' | 'compost'
}

export const formatDays = (days: number, t: TFunction): string =>
  pipe(
    Match.value(days),
    Match.when(0, () => t('card.today')),
    Match.when(1, () => t('card.tomorrow')),
    Match.orElse(() => t('card.daysCount', { count: days }))
  )

const getIcon = (type: CareType): 'water-drop' | 'spa' | 'grain' | 'compost' =>
  pipe(
    Match.value(type),
    Match.when('watering', () => 'water-drop' as const),
    Match.when('fertilization', () => 'spa' as const),
    Match.when('misting', () => 'grain' as const),
    Match.when('repotting', () => 'compost' as const),
    Match.exhaustive
  )

export const getCareIndicator = (
  care: CareStatus,
  type: CareType,
  t: TFunction
): Option.Option<CareIndicator> =>
  pipe(
    Option.fromNullable(care.daysUntil),
    Option.filter(
      (daysUntil) => care.isOverdue || daysUntil <= MAX_VISIBLE_DAYS
    ),
    Option.map((daysUntil) => {
      const icon = getIcon(type)
      return pipe(
        Match.value(care.isOverdue),
        Match.when(true, () => ({
          type,
          text: t('card.overdue'),
          daysUntil,
          isUrgent: true,
          isOverdue: true,
          isToday: false,
          icon,
        })),
        Match.orElse(() => ({
          type,
          text: formatDays(daysUntil, t),
          daysUntil,
          isUrgent: daysUntil === 0,
          isOverdue: false,
          isToday: daysUntil === 0,
          icon,
        }))
      )
    })
  )

interface CareIndicatorBadgeProps {
  indicator: Option.Option<CareIndicator>
  iconColors: ReturnType<typeof useIconColors>
}

function CareIndicatorBadge({
  indicator,
  iconColors,
}: CareIndicatorBadgeProps) {
  return Option.match(indicator, {
    onNone: () => null,
    onSome: (ind) => (
      <View
        className="flex-row items-center gap-1"
        testID={`care-indicator-${ind.type}`}
      >
        <MaterialIcons
          name={ind.icon}
          size={14}
          color={ind.isUrgent ? iconColors.warning : iconColors.primary}
        />
        <Text
          className={`text-xs font-semibold ${
            ind.isUrgent ? 'text-orange-500' : 'text-primary'
          }`}
        >
          {ind.text}
        </Text>
      </View>
    ),
  })
}

export const PlantCard = memo(function PlantCard({
  plant,
  onPress,
}: PlantCardProps) {
  const { t } = useTranslation('plants')
  const iconColors = useIconColors()
  const healthDotClass = getHealthDotClass(plant.health)

  const {
    waterIndicator,
    mistingIndicator,
    fertilizeIndicator,
    repottingIndicator,
    hasTopRow,
    hasBottomRow,
    hasAnyIndicator,
  } = useMemo(() => {
    const water = getCareIndicator(plant.watering, 'watering', t)
    const misting = pipe(
      Option.fromNullable(plant.misting),
      Option.flatMap((m) => getCareIndicator(m, 'misting', t))
    )
    const fertilize = getCareIndicator(plant.fertilization, 'fertilization', t)
    const repotting = pipe(
      Option.fromNullable(plant.repotting),
      Option.flatMap((r) => getCareIndicator(r, 'repotting', t))
    )
    const top = Option.isSome(water) || Option.isSome(misting)
    const bottom = Option.isSome(fertilize) || Option.isSome(repotting)
    return {
      waterIndicator: water,
      mistingIndicator: misting,
      fertilizeIndicator: fertilize,
      repottingIndicator: repotting,
      hasTopRow: top,
      hasBottomRow: bottom,
      hasAnyIndicator: top || bottom,
    }
  }, [plant.watering, plant.fertilization, plant.misting, plant.repotting, t])

  return (
    <Pressable
      testID={`plant-card-${plant.id}`}
      onPress={() => onPress(plant.id)}
      className="flex-row items-center p-3 bg-white dark:bg-surface-dark rounded-xl shadow-soft"
    >
      {/* Image */}
      <View className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 dark:bg-slate-700">
        {/* Health indicator dot */}
        <View
          testID="health-dot"
          className={`absolute top-1 right-1 z-10 w-2.5 h-2.5 rounded-full ${healthDotClass} ring-1 ring-white`}
        />
        {plant.imageUrl ? (
          <View testID="plant-image" className="w-full h-full">
            <AnimatedImage
              source={{ uri: plant.imageUrl }}
              className="w-full h-full"
              fallback={
                <View className="flex-1 items-center justify-center">
                  <MaterialIcons
                    name="local-florist"
                    size={28}
                    color={iconColors.primary}
                  />
                </View>
              }
            />
          </View>
        ) : (
          <View
            testID="plant-placeholder"
            className="flex-1 items-center justify-center"
          >
            <MaterialIcons
              name="local-florist"
              size={28}
              color={iconColors.primary}
            />
          </View>
        )}
      </View>

      {/* Content */}
      <View className="flex-1 ml-3">
        <View className="flex-row items-center gap-1.5">
          <Text
            numberOfLines={1}
            className="text-text-primary dark:text-white text-base font-bold leading-tight flex-1"
          >
            {plant.name}
          </Text>
          {plant.isFavorite && (
            <View testID="favorite-indicator">
              <MaterialIcons
                name="favorite"
                size={14}
                color={iconColors.coral}
              />
            </View>
          )}
        </View>
        {plant.ownership === 'caretaking' && plant.ownerName && (
          <View className="flex-row items-center gap-1">
            <MaterialIcons
              name="person"
              size={12}
              color={iconColors.textMuted}
            />
            <Text className="text-xs text-text-muted dark:text-slate-400">
              {plant.ownerName}
            </Text>
          </View>
        )}
        {plant.roomName && (
          <View className="flex-row items-center gap-1">
            <Text className="text-xs">{plant.roomIcon}</Text>
            <Text className="text-xs text-text-muted dark:text-slate-400">
              {plant.roomName}
            </Text>
          </View>
        )}
        {hasAnyIndicator && (
          <View className="mt-1 gap-0.5">
            {hasTopRow && (
              <View className="flex-row items-center gap-3">
                <CareIndicatorBadge
                  indicator={waterIndicator}
                  iconColors={iconColors}
                />
                <CareIndicatorBadge
                  indicator={mistingIndicator}
                  iconColors={iconColors}
                />
              </View>
            )}
            {hasBottomRow && (
              <View className="flex-row items-center gap-3">
                <CareIndicatorBadge
                  indicator={fertilizeIndicator}
                  iconColors={iconColors}
                />
                <CareIndicatorBadge
                  indicator={repottingIndicator}
                  iconColors={iconColors}
                />
              </View>
            )}
          </View>
        )}
      </View>
    </Pressable>
  )
})
