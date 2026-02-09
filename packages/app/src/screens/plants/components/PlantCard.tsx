import { MaterialIcons } from '@expo/vector-icons'
import { Array, Match, Option, pipe } from 'effect'
import type { TFunction } from 'i18next'
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
    isFavorite?: boolean
  }
  onPress: (plantId: string) => void
}

const getHealthDotClass = (health: HealthStatus): string =>
  pipe(
    Match.value(health),
    Match.when('healthy', () => 'bg-primary'),
    Match.when('attention', () => 'bg-orange-400'),
    Match.when('critical', () => 'bg-red-400'),
    Match.exhaustive
  )

export type CareType = 'water' | 'fertilize'

export interface CareIndicator {
  type: CareType
  text: string
  isUrgent: boolean
  isOverdue: boolean
  isToday: boolean
  icon: 'water-drop' | 'spa'
}

export const formatDays = (days: number, t: TFunction): string =>
  pipe(
    Match.value(days),
    Match.when(0, () => t('card.today')),
    Match.when(1, () => t('card.tomorrow')),
    Match.orElse(() => t('card.daysCount', { count: days }))
  )

const getIcon = (type: CareType): 'water-drop' | 'spa' =>
  pipe(
    Match.value(type),
    Match.when('water', () => 'water-drop' as const),
    Match.when('fertilize', () => 'spa' as const),
    Match.exhaustive
  )

export const getCareIndicator = (
  care: CareStatus,
  type: CareType,
  t: TFunction
): Option.Option<CareIndicator> =>
  pipe(
    Option.fromNullable(care.daysUntil),
    Option.map((daysUntil) => {
      const icon = getIcon(type)
      return pipe(
        Match.value(care.isOverdue),
        Match.when(true, () => ({
          type,
          text: t('card.overdue'),
          isUrgent: true,
          isOverdue: true,
          isToday: false,
          icon,
        })),
        Match.orElse(() => ({
          type,
          text: formatDays(daysUntil, t),
          isUrgent: daysUntil === 0,
          isOverdue: false,
          isToday: daysUntil === 0,
          icon,
        }))
      )
    })
  )

type IndicatorPriority = 'overdue' | 'today' | 'soonest' | 'none'

const classifyIndicators = (
  indicators: ReadonlyArray<CareIndicator>
): IndicatorPriority => {
  const overdueCount = Array.filter(indicators, (i) => i.isOverdue).length
  const todayCount = Array.filter(indicators, (i) => i.isToday).length

  return pipe(
    Match.value({ overdueCount, todayCount, total: indicators.length }),
    Match.when({ total: 0 }, () => 'none' as const),
    Match.when({ overdueCount: 1 }, () => 'overdue' as const),
    Match.when({ overdueCount: 2 }, () => 'overdue' as const),
    Match.when({ todayCount: 1 }, () => 'today' as const),
    Match.when({ todayCount: 2 }, () => 'today' as const),
    Match.orElse(() => 'soonest' as const)
  )
}

const selectByPriority = (
  indicators: ReadonlyArray<CareIndicator>,
  priority: IndicatorPriority,
  watering: CareStatus,
  fertilization: CareStatus
): ReadonlyArray<CareIndicator> =>
  pipe(
    Match.value(priority),
    Match.when('none', () => [] as ReadonlyArray<CareIndicator>),
    Match.when('overdue', () => Array.filter(indicators, (i) => i.isOverdue)),
    Match.when('today', () => Array.filter(indicators, (i) => i.isToday)),
    Match.when('soonest', () => {
      const waterDays = Option.getOrElse(
        Option.fromNullable(watering.daysUntil),
        () => 999
      )
      const fertilizeDays = Option.getOrElse(
        Option.fromNullable(fertilization.daysUntil),
        () => 999
      )

      return pipe(
        Array.findFirst(indicators, (i) =>
          waterDays <= fertilizeDays
            ? i.type === 'water'
            : i.type === 'fertilize'
        ),
        Option.match({
          onNone: () =>
            pipe(
              Array.head(indicators),
              Option.match({
                onNone: () => [] as ReadonlyArray<CareIndicator>,
                onSome: (first) => [first],
              })
            ),
          onSome: (indicator) => [indicator],
        })
      )
    }),
    Match.exhaustive
  )

export const getCareIndicators = (
  watering: CareStatus,
  fertilization: CareStatus,
  t: TFunction
): ReadonlyArray<CareIndicator> => {
  const waterIndicator = getCareIndicator(watering, 'water', t)
  const fertilizeIndicator = getCareIndicator(fertilization, 'fertilize', t)

  const indicators = pipe(
    [waterIndicator, fertilizeIndicator],
    Array.filterMap((opt) => opt)
  )

  const priority = classifyIndicators(indicators)
  return selectByPriority(indicators, priority, watering, fertilization)
}

export function PlantCard({ plant, onPress }: PlantCardProps) {
  const { t } = useTranslation('plants')
  const iconColors = useIconColors()
  const healthDotClass = getHealthDotClass(plant.health)
  const indicators = getCareIndicators(plant.watering, plant.fertilization, t)

  return (
    <Pressable
      testID={`plant-card-${plant.id}`}
      onPress={() => onPress(plant.id)}
      className="flex flex-col gap-3 p-3 bg-white dark:bg-surface-dark rounded-xl shadow-soft"
    >
      {/* Image Container */}
      <View className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-slate-700">
        {/* Favorite indicator */}
        {plant.isFavorite && (
          <View
            testID="favorite-indicator"
            className="absolute top-2 left-2 z-10"
          >
            <MaterialIcons name="favorite" size={18} color={iconColors.coral} />
          </View>
        )}
        {/* Health indicator dot */}
        <View
          testID="health-dot"
          className={`absolute top-2 right-2 z-10 w-3 h-3 rounded-full ${healthDotClass} ring-2 ring-white shadow-sm`}
        />
        {plant.imageUrl ? (
          <AnimatedImage
            source={{ uri: plant.imageUrl }}
            className="w-full h-full"
            fallback={
              <View className="flex-1 items-center justify-center">
                <MaterialIcons
                  name="local-florist"
                  size={48}
                  color={iconColors.primary}
                />
              </View>
            }
          />
        ) : (
          <View
            testID="plant-placeholder"
            className="flex-1 items-center justify-center"
          >
            <MaterialIcons
              name="local-florist"
              size={48}
              color={iconColors.primary}
            />
          </View>
        )}
      </View>

      {/* Content */}
      <View>
        <Text
          numberOfLines={2}
          className="text-text-primary dark:text-white text-base font-bold leading-tight mb-1"
        >
          {plant.name}
        </Text>
        {indicators.length > 0 && (
          <View className="flex-row items-center gap-3">
            {Array.map(indicators, (indicator) => (
              <View
                key={indicator.type}
                className="flex-row items-center gap-1"
              >
                <MaterialIcons
                  name={indicator.icon}
                  size={14}
                  color={
                    indicator.isUrgent ? iconColors.warning : iconColors.primary
                  }
                />
                <Text
                  className={`text-xs font-semibold ${
                    indicator.isUrgent ? 'text-orange-500' : 'text-primary'
                  }`}
                >
                  {indicator.text}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  )
}
