import { MaterialIcons } from '@expo/vector-icons'
import { Text, View } from 'react-native'
import { Badge } from 'src/components/Badge'
import { SectionHeader } from 'src/components/SectionHeader'
import { iconColors } from 'src/theme'

type SunlightLevel = 'low' | 'indirect' | 'bright' | 'direct'
type WaterLevel = 'low' | 'moderate' | 'high'
type HumidityLevel = 'low' | 'moderate' | 'high' | 'tropical'

interface IdealEnvironmentProps {
  sunlight: SunlightLevel
  water: WaterLevel
  humidity: HumidityLevel
}

const SUNLIGHT_LABELS: Record<SunlightLevel, string> = {
  low: 'Low Light',
  indirect: 'Indirect Bright',
  bright: 'Bright Light',
  direct: 'Direct Sun',
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

interface EnvironmentRowProps {
  icon: keyof typeof MaterialIcons.glyphMap
  label: string
  value: string
}

function EnvironmentRow({ icon, label, value }: EnvironmentRowProps) {
  return (
    <View
      className="flex-row items-center py-3"
      testID={`environment-row-${label.toLowerCase()}`}
    >
      <View className="w-8 h-8 rounded-full items-center justify-center bg-surface-tinted">
        <MaterialIcons name={icon} size={18} color={iconColors.muted} />
      </View>
      <Text className="flex-1 text-base ml-3 font-regular text-text-primary">
        {label}
      </Text>
      <Badge label={value} variant="info" size="sm" />
    </View>
  )
}

export function IdealEnvironment({
  sunlight,
  water,
  humidity,
}: IdealEnvironmentProps) {
  return (
    <View testID="ideal-environment">
      <SectionHeader title="Ideal Environment" />
      <View className="mt-2">
        <EnvironmentRow
          icon="wb-sunny"
          label="Sunlight"
          value={SUNLIGHT_LABELS[sunlight]}
        />
        <EnvironmentRow
          icon="water-drop"
          label="Water"
          value={capitalize(water)}
        />
        <EnvironmentRow
          icon="cloud"
          label="Humidity"
          value={capitalize(humidity)}
        />
      </View>
    </View>
  )
}
