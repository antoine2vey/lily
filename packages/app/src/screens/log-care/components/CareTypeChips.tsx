import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

type CareType = 'water' | 'fertilize'

interface CareTypeToggleProps {
  value: CareType
  onValueChange: (type: CareType) => void
  label?: string
}

const CARE_TYPES: Array<{
  type: CareType
  label: string
  icon: keyof typeof MaterialIcons.glyphMap
}> = [
  { type: 'water', label: 'Watering', icon: 'water-drop' },
  { type: 'fertilize', label: 'Fertilization', icon: 'eco' },
]

export function CareTypeChips({
  value,
  onValueChange,
  label = 'Care Type',
}: CareTypeToggleProps) {
  const iconColors = useIconColors()
  return (
    <View className="mb-6">
      {label && (
        <Text className="text-sm mb-2 font-bold text-text-muted dark:text-slate-400 ml-1">
          {label}
        </Text>
      )}
      {/* Toggle container */}
      <View className="bg-surface-tinted dark:bg-slate-800 p-1.5 rounded-full flex-row h-14">
        {pipe(
          CARE_TYPES,
          Array.map((careType) => {
            const isSelected = value === careType.type
            return (
              <Pressable
                key={careType.type}
                onPress={() => onValueChange(careType.type)}
                className={`flex-1 h-full flex-row items-center justify-center gap-2 rounded-full ${
                  isSelected ? 'bg-primary' : ''
                }`}
              >
                <MaterialIcons
                  name={careType.icon}
                  size={20}
                  color={isSelected ? iconColors.white : iconColors.textMuted}
                />
                <Text
                  className={`font-bold ${
                    isSelected
                      ? 'text-white'
                      : 'text-text-muted dark:text-slate-400'
                  }`}
                >
                  {careType.label}
                </Text>
              </Pressable>
            )
          })
        )}
      </View>
    </View>
  )
}

// Export the CareType for use elsewhere
export type { CareType }
