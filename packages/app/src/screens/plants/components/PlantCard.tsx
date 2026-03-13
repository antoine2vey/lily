import { MaterialIcons } from '@expo/vector-icons'
import type { CareType } from '@lily/shared'
import { Array, Match, Number, Option, Order, pipe } from 'effect'
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
    misting: CareStatus
    repotting: CareStatus
    isFavorite?: boolean
    roomName?: string
    roomIcon?: string
    ownership?: 'owned' | 'caretaking'
    ownerName?: string
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

type IndicatorPriority = 'overdue' | 'today' | 'soonest' | 'none'

const classifyIndicators = (
  indicators: ReadonlyArray<CareIndicator>
): IndicatorPriority => {
  const overdueCount = Array.countBy(indicators, (i) => i.isOverdue)
  const todayCount = Array.countBy(indicators, (i) => i.isToday)

  return pipe(
    Match.value({ overdueCount, todayCount, total: Array.length(indicators) }),
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
  priority: IndicatorPriority
): ReadonlyArray<CareIndicator> =>
  pipe(
    Match.value(priority),
    Match.when('none', () => [] as ReadonlyArray<CareIndicator>),
    Match.when('overdue', () => Array.filter(indicators, (i) => i.isOverdue)),
    Match.when('today', () => Array.filter(indicators, (i) => i.isToday)),
    Match.when('soonest', () =>
      pipe(
        indicators,
        Array.sort(
          Order.mapInput(Number.Order, (i: CareIndicator) =>
            Option.getOrElse(Option.fromNullable(i.daysUntil), () => 999)
          )
        ),
        Array.head,
        Option.match({
          onNone: () => [] as ReadonlyArray<CareIndicator>,
          onSome: (first) => [first],
        })
      )
    ),
    Match.exhaustive
  )

export const getCareIndicators = (
  watering: CareStatus,
  fertilization: CareStatus,
  t: TFunction,
  misting?: CareStatus,
  repotting?: CareStatus
): ReadonlyArray<CareIndicator> => {
  const waterIndicator = getCareIndicator(watering, 'watering', t)
  const fertilizeIndicator = getCareIndicator(fertilization, 'fertilization', t)
  const mistingIndicator = pipe(
    Option.fromNullable(misting),
    Option.flatMap((m) => getCareIndicator(m, 'misting', t))
  )
  const repottingIndicator = pipe(
    Option.fromNullable(repotting),
    Option.flatMap((r) => getCareIndicator(r, 'repotting', t))
  )

  const indicators = pipe(
    [waterIndicator, fertilizeIndicator, mistingIndicator, repottingIndicator],
    Array.filterMap((opt) => opt)
  )

  const priority = classifyIndicators(indicators)
  return selectByPriority(indicators, priority)
}

export function PlantCard({ plant, onPress }: PlantCardProps) {
  const { t } = useTranslation('plants')
  const iconColors = useIconColors()
  const healthDotClass = getHealthDotClass(plant.health)
  const indicators = getCareIndicators(
    plant.watering,
    plant.fertilization,
    t,
    plant.misting,
    plant.repotting
  )

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
          <View testID="plant-image" className="w-full h-full">
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
          </View>
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
        {plant.ownership === 'caretaking' && plant.ownerName && (
          <View className="flex-row items-center gap-1 mb-0.5">
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
          <View className="flex-row items-center gap-1 mb-1">
            <Text className="text-xs">{plant.roomIcon}</Text>
            <Text className="text-xs text-text-muted dark:text-slate-400">
              {plant.roomName}
            </Text>
          </View>
        )}
        {Array.isNonEmptyReadonlyArray(indicators) && (
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
