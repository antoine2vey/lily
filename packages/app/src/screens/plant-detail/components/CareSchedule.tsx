import { MaterialIcons } from '@expo/vector-icons'
import { Text, View } from 'react-native'
import { SectionHeader } from 'src/components/SectionHeader'
import { iconColors } from 'src/theme'

interface CareScheduleProps {
  wateringDays: number
  wateringDate: string
  fertilizingDays: number
  fertilizingDate: string
  onEdit: () => void
}

interface CareCardProps {
  icon: keyof typeof MaterialIcons.glyphMap
  iconColor: string
  days: number
  label: string
  nextDate: string
}

function CareCard({ icon, iconColor, days, label, nextDate }: CareCardProps) {
  const isOverdue = days < 0
  const displayDays = Math.abs(days)

  const containerClass = isOverdue
    ? 'flex-1 p-4 rounded-xl bg-orange-100 border border-warning'
    : 'flex-1 p-4 rounded-xl bg-surface-tinted'

  const numberColorClass = isOverdue ? 'text-warning' : 'text-primary'
  const borderColorClass = isOverdue ? 'border-warning' : 'border-primary'

  return (
    <View
      className={containerClass}
      testID={`care-card-${label.toLowerCase()}`}
    >
      <View className="flex-row items-center mb-3">
        <MaterialIcons name={icon} size={20} color={iconColor} />
        <Text className="text-sm ml-2 font-medium text-text-primary">
          {label}
        </Text>
      </View>
      <View
        className={`w-16 h-16 rounded-full items-center justify-center self-center mb-3 border-[3px] ${borderColorClass}`}
      >
        <Text className={`text-2xl font-bold ${numberColorClass}`}>
          {displayDays}
        </Text>
        <Text className={`text-[10px] font-medium ${numberColorClass}`}>
          {isOverdue ? 'OVERDUE' : 'DAYS'}
        </Text>
      </View>
      <Text className="text-xs text-center font-regular text-text-muted">
        {nextDate}
      </Text>
    </View>
  )
}

export function CareSchedule({
  wateringDays,
  wateringDate,
  fertilizingDays,
  fertilizingDate,
  onEdit,
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
        />
        <CareCard
          icon="eco"
          iconColor={iconColors.fertilizerOrange}
          days={fertilizingDays}
          label="Fertilizing"
          nextDate={fertilizingDate}
        />
      </View>
    </View>
  )
}
