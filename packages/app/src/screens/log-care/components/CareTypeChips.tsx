import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { Text, View } from 'react-native'
import { Chip } from 'src/components/Chip'
import { iconColors } from 'src/theme'

type CareType = 'water' | 'fertilize'

interface CareTypeChipsProps {
  value: CareType
  onValueChange: (type: CareType) => void
  label?: string
}

const CARE_TYPES: Array<{
  type: CareType
  label: string
  icon: keyof typeof MaterialIcons.glyphMap
}> = [
  { type: 'water', label: 'Water', icon: 'water-drop' },
  { type: 'fertilize', label: 'Fertilize', icon: 'eco' },
]

export function CareTypeChips({
  value,
  onValueChange,
  label = 'Care Type',
}: CareTypeChipsProps) {
  return (
    <View className="mb-4">
      {label && (
        <Text className="text-sm mb-3 font-medium text-text-primary">
          {label}
        </Text>
      )}
      <View className="flex-row flex-wrap gap-2">
        {pipe(
          CARE_TYPES,
          Array.map((careType) => (
            <Chip
              key={careType.type}
              label={careType.label}
              selected={value === careType.type}
              onPress={() => onValueChange(careType.type)}
              icon={
                <MaterialIcons
                  name={careType.icon}
                  size={14}
                  color={
                    value === careType.type
                      ? iconColors.white
                      : iconColors.textPrimary
                  }
                />
              }
            />
          ))
        )}
      </View>
    </View>
  )
}

// Export the CareType for use elsewhere
export type { CareType }
