import { MaterialIcons } from '@expo/vector-icons'
import { Text, View } from 'react-native'
import { SectionHeader } from 'src/components/SectionHeader'
import { colors, fonts } from 'src/theme'

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

  return (
    <View
      className="flex-1 p-4 rounded-xl"
      style={{
        backgroundColor: isOverdue ? '#FFF3E0' : colors.surfaceTinted,
        borderWidth: isOverdue ? 1 : 0,
        borderColor: isOverdue ? colors.warning : 'transparent',
      }}
      testID={`care-card-${label.toLowerCase()}`}
    >
      <View className="flex-row items-center mb-3">
        <MaterialIcons name={icon} size={20} color={iconColor} />
        <Text
          className="text-sm ml-2"
          style={{ fontFamily: fonts.medium, color: colors.textPrimary }}
        >
          {label}
        </Text>
      </View>
      <View
        className="w-16 h-16 rounded-full items-center justify-center self-center mb-3"
        style={{
          borderWidth: 3,
          borderColor: isOverdue ? colors.warning : colors.primary,
        }}
      >
        <Text
          className="text-2xl"
          style={{
            fontFamily: fonts.bold,
            color: isOverdue ? colors.warning : colors.primary,
          }}
        >
          {displayDays}
        </Text>
        <Text
          className="text-[10px]"
          style={{
            fontFamily: fonts.medium,
            color: isOverdue ? colors.warning : colors.primary,
          }}
        >
          {isOverdue ? 'OVERDUE' : 'DAYS'}
        </Text>
      </View>
      <Text
        className="text-xs text-center"
        style={{ fontFamily: fonts.regular, color: colors.textMuted }}
      >
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
          iconColor={colors.waterBlue}
          days={wateringDays}
          label="Watering"
          nextDate={wateringDate}
        />
        <CareCard
          icon="eco"
          iconColor={colors.fertilizerOrange}
          days={fertilizingDays}
          label="Fertilizing"
          nextDate={fertilizingDate}
        />
      </View>
    </View>
  )
}
