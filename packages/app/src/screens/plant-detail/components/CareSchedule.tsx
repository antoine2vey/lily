import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe, String } from 'effect'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { SectionHeader } from 'src/components/SectionHeader'
import { useIconColors } from 'src/hooks/useIconColors'

interface CareScheduleProps {
  wateringDays: number
  wateringDate: string
  fertilizingDays: number | null
  fertilizingDate: string
  onEdit: () => void
  onWaterNow?: () => void
  onFertilizeNow?: () => void
  onWaterPast?: () => void
  onFertilizePast?: () => void
  isWaterFirstTime?: boolean
  isFertilizeFirstTime?: boolean
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

  // Handle "not scheduled" state
  if (days === null) {
    return (
      <View
        className="flex-1 p-4 rounded-xl bg-surface dark:bg-surface-dark border border-border dark:border-slate-700"
        testID={`care-card-${String.toLowerCase(label)}`}
      >
        <View className="flex-row items-center mb-3">
          <View className="w-8 h-8 rounded-full items-center justify-center bg-surface-tinted dark:bg-slate-700">
            <MaterialIcons name={icon} size={18} color={iconColor} />
          </View>
          <Text className="text-sm ml-2 font-medium text-text-primary dark:text-white">
            {label}
          </Text>
        </View>
        <Text className="text-lg font-semibold text-text-muted dark:text-slate-400">
          {t('detail.notScheduled')}
        </Text>
        <Text className="text-xs font-regular text-text-muted dark:text-slate-500 mt-1">
          {t('detail.setScheduleToTrack')}
        </Text>
      </View>
    )
  }

  const urgency = getUrgencyState(days)
  const styles = getUrgencyStyles(urgency)
  const timeText = getTimeText(days, urgency, t)
  const showDoNow = (urgency === 'overdue' || urgency === 'today') && onDoNow

  return (
    <View
      className={`flex-1 p-4 rounded-xl ${styles.containerClass}`}
      testID={`care-card-${String.toLowerCase(label)}`}
    >
      <View className="flex-row items-center mb-3">
        <View
          className={`w-8 h-8 rounded-full items-center justify-center ${styles.iconBgClass}`}
        >
          <MaterialIcons name={icon} size={18} color={iconColor} />
        </View>
        <Text className="text-sm ml-2 font-medium text-text-primary dark:text-white">
          {label}
        </Text>
      </View>

      <Text className={`text-lg font-semibold ${styles.textClass}`}>
        {timeText}
      </Text>

      <Text className="text-xs font-regular text-text-muted dark:text-slate-400 mt-1">
        {nextDate}
      </Text>

      {showDoNow && (
        <Pressable
          onPress={onDoNow}
          className="mt-3 py-2 px-3 rounded-lg bg-white/80 dark:bg-slate-700/80 active:bg-white dark:active:bg-slate-600 self-start"
          testID={`care-card-${String.toLowerCase(label)}-do-now`}
        >
          <Text className="text-xs font-semibold text-primary">
            {t('detail.doNow')}
          </Text>
        </Pressable>
      )}
      {isFirstTime && onLogPast && (
        <Pressable
          onPress={onLogPast}
          className="mt-2 py-2 px-3 rounded-lg bg-white/80 dark:bg-slate-700/80 active:bg-white dark:active:bg-slate-600 self-start"
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
  onEdit,
  onWaterNow,
  onFertilizeNow,
  onWaterPast,
  onFertilizePast,
  isWaterFirstTime,
  isFertilizeFirstTime,
}: CareScheduleProps) {
  const { t } = useTranslation('plants')
  const iconColors = useIconColors()

  return (
    <View testID="care-schedule">
      <SectionHeader
        title={t('detail.careSchedule')}
        action={{ label: t('detail.edit'), onPress: onEdit }}
      />
      <View className="flex-row gap-3 mt-4">
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
      </View>
    </View>
  )
}
