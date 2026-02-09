import { MaterialIcons } from '@expo/vector-icons'
import { Array, Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

type CareType = 'water' | 'fertilize'

interface CareTypeToggleProps {
  value: CareType
  onValueChange: (type: CareType) => void
  label?: string
}

interface CareTypeDefinition {
  type: CareType
  labelKey: 'water' | 'fertilize'
  icon: keyof typeof MaterialIcons.glyphMap
}

const CARE_TYPES: ReadonlyArray<CareTypeDefinition> = [
  { type: 'water', labelKey: 'water', icon: 'water-drop' },
  { type: 'fertilize', labelKey: 'fertilize', icon: 'eco' },
]

export function CareTypeChips({
  value,
  onValueChange,
  label,
}: CareTypeToggleProps) {
  const { t } = useTranslation('logCare')
  const iconColors = useIconColors()
  const displayLabel = Option.getOrElse(Option.fromNullable(label), () =>
    t('careType')
  )

  return (
    <View className="mb-6">
      {displayLabel && (
        <Text className="text-sm mb-2 font-bold text-text-muted dark:text-slate-400 ml-1">
          {displayLabel}
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
                  {t(`careTypes.${careType.labelKey}`)}
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
