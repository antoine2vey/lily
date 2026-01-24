import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { Pressable, Text, View } from 'react-native'
import { SectionHeader } from 'src/components/SectionHeader'
import { iconColors } from 'src/theme'

interface CareScheduleProps {
  wateringDays: number
  wateringDate: string
  fertilizingDays: number | null
  fertilizingDate: string
  onEdit: () => void
  onWaterNow?: () => void
  onFertilizeNow?: () => void
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
      containerClass: 'bg-orange-50 border border-warning',
      textClass: 'text-warning',
      iconBgClass: 'bg-warning/20',
    })),
    Match.when('today', () => ({
      containerClass: 'bg-primary-tint border border-primary',
      textClass: 'text-primary',
      iconBgClass: 'bg-primary/20',
    })),
    Match.when('soon', () => ({
      containerClass: 'bg-amber-50 border border-amber-400',
      textClass: 'text-amber-600',
      iconBgClass: 'bg-amber-100',
    })),
    Match.orElse(() => ({
      containerClass: 'bg-surface-tinted border border-border',
      textClass: 'text-text-secondary',
      iconBgClass: 'bg-surface',
    }))
  )

const getTimeText = (days: number, urgency: UrgencyState): string =>
  pipe(
    Match.value(urgency),
    Match.when('overdue', () =>
      days === -1 ? '1 day overdue' : `${Math.abs(days)} days overdue`
    ),
    Match.when('today', () => 'Today'),
    Match.when('soon', () => (days === 1 ? 'Tomorrow' : `In ${days} days`)),
    Match.orElse(() => `In ${days} days`)
  )

interface CareCardProps {
  icon: keyof typeof MaterialIcons.glyphMap
  iconColor: string
  days: number | null
  label: string
  nextDate: string
  onDoNow?: () => void
}

function CareCard({
  icon,
  iconColor,
  days,
  label,
  nextDate,
  onDoNow,
}: CareCardProps) {
  // Handle "not scheduled" state
  if (days === null) {
    return (
      <View
        className="flex-1 p-4 rounded-xl bg-surface-tinted border border-border"
        testID={`care-card-${label.toLowerCase()}`}
      >
        <View className="flex-row items-center mb-3">
          <View className="w-8 h-8 rounded-full items-center justify-center bg-surface">
            <MaterialIcons name={icon} size={18} color={iconColor} />
          </View>
          <Text className="text-sm ml-2 font-medium text-text-primary">
            {label}
          </Text>
        </View>
        <Text className="text-lg font-semibold text-text-muted">
          Not scheduled
        </Text>
        <Text className="text-xs font-regular text-text-muted mt-1">
          Set a schedule to track
        </Text>
      </View>
    )
  }

  const urgency = getUrgencyState(days)
  const styles = getUrgencyStyles(urgency)
  const timeText = getTimeText(days, urgency)
  const showDoNow = (urgency === 'overdue' || urgency === 'today') && onDoNow

  return (
    <View
      className={`flex-1 p-4 rounded-xl ${styles.containerClass}`}
      testID={`care-card-${label.toLowerCase()}`}
    >
      <View className="flex-row items-center mb-3">
        <View
          className={`w-8 h-8 rounded-full items-center justify-center ${styles.iconBgClass}`}
        >
          <MaterialIcons name={icon} size={18} color={iconColor} />
        </View>
        <Text className="text-sm ml-2 font-medium text-text-primary">
          {label}
        </Text>
      </View>

      <Text className={`text-lg font-semibold ${styles.textClass}`}>
        {timeText}
      </Text>

      <Text className="text-xs font-regular text-text-muted mt-1">
        {nextDate}
      </Text>

      {showDoNow && (
        <Pressable
          onPress={onDoNow}
          className="mt-3 py-2 px-3 rounded-lg bg-white/80 active:bg-white self-start"
          testID={`care-card-${label.toLowerCase()}-do-now`}
        >
          <Text className="text-xs font-semibold text-primary">Do Now</Text>
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
}: CareScheduleProps) {
  return (
    <View testID="care-schedule">
      <SectionHeader
        title="Care Schedule"
        action={{ label: 'Edit', onPress: onEdit }}
      />
      <View className="flex-row gap-3 mt-4">
        <CareCard
          icon="water-drop"
          iconColor={iconColors.waterBlue}
          days={wateringDays}
          label="Watering"
          nextDate={wateringDate}
          onDoNow={onWaterNow}
        />
        <CareCard
          icon="eco"
          iconColor={iconColors.fertilizerOrange}
          days={fertilizingDays}
          label="Fertilizing"
          nextDate={fertilizingDate}
          onDoNow={onFertilizeNow}
        />
      </View>
    </View>
  )
}
