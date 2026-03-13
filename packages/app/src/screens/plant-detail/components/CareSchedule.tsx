import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe, String } from 'effect'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { SectionHeader } from 'src/components/SectionHeader'
import { useIconColors } from 'src/hooks/useIconColors'
import { MAX_VISIBLE_DAYS } from 'src/screens/plants/components/PlantCard'

interface CareScheduleProps {
  wateringDays: number
  wateringDate: string
  fertilizingDays: number | null
  fertilizingDate: string
  mistingDays: number | null
  mistingDate: string
  repottingDays: number | null
  repottingDate: string
  onEdit: () => void
  onWaterNow?: () => void
  onFertilizeNow?: () => void
  onMistNow?: () => void
  onRepotNow?: () => void
  onWaterPast?: () => void
  onFertilizePast?: () => void
  onMistPast?: () => void
  onRepotPast?: () => void
  isWaterFirstTime?: boolean
  isFertilizeFirstTime?: boolean
  isMistFirstTime?: boolean
  isRepotFirstTime?: boolean
  onCorrectDates?: () => void
}

type UrgencyState = 'overdue' | 'today' | 'soon' | 'normal'

const getUrgencyState = (days: number): UrgencyState =>
  pipe(
    Match.value(days),
    Match.when(
      (d) => d < 0,
      () => 'overdue' as const
    ),
    Match.when(
      (d) => d === 0,
      () => 'today' as const
    ),
    Match.when(
      (d) => d <= 2,
      () => 'soon' as const
    ),
    Match.orElse(() => 'normal' as const)
  )

interface UrgencyStyle {
  containerClass: string
  textClass: string
  iconBgClass: string
}

const getUrgencyStyles = (urgency: UrgencyState): UrgencyStyle =>
  pipe(
    Match.value(urgency),
    Match.when('overdue', () => ({
      containerClass:
        'bg-orange-50 dark:bg-warning/10 border border-warning dark:border-warning/50',
      textClass: 'text-warning dark:text-amber-400',
      iconBgClass: 'bg-warning/20 dark:bg-warning/30',
    })),
    Match.when('today', () => ({
      containerClass:
        'bg-primary-tint dark:bg-primary/10 border border-primary dark:border-primary/50',
      textClass: 'text-primary dark:text-primary-light',
      iconBgClass: 'bg-primary/20 dark:bg-primary/30',
    })),
    Match.when('soon', () => ({
      containerClass:
        'bg-amber-50 dark:bg-amber-500/10 border border-amber-400 dark:border-amber-500/50',
      textClass: 'text-amber-600 dark:text-amber-400',
      iconBgClass: 'bg-amber-100 dark:bg-amber-500/20',
    })),
    Match.orElse(() => ({
      containerClass:
        'bg-surface dark:bg-surface-dark border border-border dark:border-slate-700',
      textClass: 'text-text-secondary dark:text-slate-400',
      iconBgClass: 'bg-surface-tinted dark:bg-slate-700',
    }))
  )

const getTimeText = (
  days: number,
  urgency: UrgencyState,
  t: TFunction
): string =>
  pipe(
    Match.value(urgency),
    Match.when('overdue', () =>
      days === -1
        ? t('plants:detail.schedule.oneDayOverdue')
        : t('plants:detail.schedule.daysOverdue', { count: Math.abs(days) })
    ),
    Match.when('today', () => t('plants:detail.schedule.today')),
    Match.when('soon', () =>
      days === 1
        ? t('plants:detail.schedule.tomorrow')
        : t('plants:detail.schedule.inDays', { count: days })
    ),
    Match.orElse(() => t('plants:detail.schedule.inDays', { count: days }))
  )

interface CareCardProps {
  icon: keyof typeof MaterialIcons.glyphMap
  iconColor: string
  days: number | null
  label: string
  nextDate: string
  onDoNow?: () => void
  onLogPast?: () => void
  isFirstTime?: boolean
}

function CareCard({
  icon,
  iconColor,
  days,
  label,
  nextDate,
  onDoNow,
  onLogPast,
  isFirstTime,
}: CareCardProps) {
  const { t } = useTranslation('plants')

  // Hide cards that are not scheduled or beyond 14 days
  if (days === null || days > MAX_VISIBLE_DAYS) {
    return null
  }

  const urgency = getUrgencyState(days)
  const styles = getUrgencyStyles(urgency)
  const timeText = getTimeText(days, urgency, t)
  const showDoNow = (urgency === 'overdue' || urgency === 'today') && onDoNow

  return (
    <View
      className={`flex-row items-center p-4 rounded-xl ${styles.containerClass}`}
      testID={`care-card-${String.toLowerCase(label)}`}
    >
      {/* Icon */}
      <View
        className={`w-10 h-10 rounded-full items-center justify-center ${styles.iconBgClass}`}
      >
        <MaterialIcons name={icon} size={20} color={iconColor} />
      </View>

      {/* Text block */}
      <View className="flex-1 ml-3">
        <Text className="text-sm font-medium text-text-primary dark:text-white">
          {label}
        </Text>
        <Text className={`text-base font-semibold ${styles.textClass}`}>
          {timeText}
        </Text>
        <Text className="text-xs font-regular text-text-muted dark:text-slate-400 mt-0.5">
          {nextDate}
        </Text>
      </View>

      {/* Actions */}
      {showDoNow && (
        <Pressable
          onPress={onDoNow}
          className="py-2 px-3 rounded-lg bg-white/80 dark:bg-slate-700/80 active:bg-white dark:active:bg-slate-600"
          testID={`care-card-${String.toLowerCase(label)}-do-now`}
        >
          <Text className="text-xs font-semibold text-primary">
            {t('detail.doNow')}
          </Text>
        </Pressable>
      )}
      {isFirstTime && onLogPast && !showDoNow && (
        <Pressable
          onPress={onLogPast}
          className="py-2 px-3 rounded-lg bg-white/80 dark:bg-slate-700/80 active:bg-white dark:active:bg-slate-600"
          testID={`care-card-${String.toLowerCase(label)}-already-done`}
        >
          <Text className="text-xs font-semibold text-text-secondary dark:text-slate-400">
            {t('detail.alreadyDone')}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

export function CareSchedule({
  wateringDays,
  wateringDate,
  fertilizingDays,
  fertilizingDate,
  mistingDays,
  mistingDate,
  repottingDays,
  repottingDate,
  onEdit,
  onWaterNow,
  onFertilizeNow,
  onMistNow,
  onRepotNow,
  onWaterPast,
  onFertilizePast,
  onMistPast,
  onRepotPast,
  isWaterFirstTime,
  isFertilizeFirstTime,
  isMistFirstTime,
  isRepotFirstTime,
  onCorrectDates,
}: CareScheduleProps) {
  const { t } = useTranslation('plants')
  const iconColors = useIconColors()

  return (
    <View testID="care-schedule">
      <SectionHeader
        title={t('detail.careSchedule')}
        action={{ label: t('detail.edit'), onPress: onEdit }}
      />
      {onCorrectDates && (
        <Pressable onPress={onCorrectDates} className="mt-1">
          <Text className="text-xs font-regular text-primary dark:text-primary-light underline">
            {t('detail.correctDates.link')}
          </Text>
        </Pressable>
      )}
      <View className="gap-3 mt-4">
        <CareCard
          icon="water-drop"
          iconColor={iconColors.waterBlue}
          days={wateringDays}
          label={t('careTypes.water')}
          nextDate={wateringDate}
          onDoNow={onWaterNow}
          onLogPast={onWaterPast}
          isFirstTime={isWaterFirstTime}
        />
        <CareCard
          icon="eco"
          iconColor={iconColors.fertilizerOrange}
          days={fertilizingDays}
          label={t('careTypes.fertilize')}
          nextDate={fertilizingDate}
          onDoNow={onFertilizeNow}
          onLogPast={onFertilizePast}
          isFirstTime={isFertilizeFirstTime}
        />
        <CareCard
          icon="grain"
          iconColor={iconColors.mistTeal}
          days={mistingDays}
          label={t('careTypes.mist')}
          nextDate={mistingDate}
          onDoNow={onMistNow}
          onLogPast={onMistPast}
          isFirstTime={isMistFirstTime}
        />
        <CareCard
          icon="yard"
          iconColor={iconColors.repotBrown}
          days={repottingDays}
          label={t('careTypes.repot')}
          nextDate={repottingDate}
          onDoNow={onRepotNow}
          onLogPast={onRepotPast}
          isFirstTime={isRepotFirstTime}
        />
      </View>
    </View>
  )
}
