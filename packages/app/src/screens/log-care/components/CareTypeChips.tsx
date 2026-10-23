import { MaterialIcons } from '@expo/vector-icons'
import type { CareType } from '@lily/shared'
import { Array, Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

interface CareTypeToggleProps {
  value: CareType
  onValueChange: (type: CareType) => void
  label?: string
}

interface CareTypeDefinition {
  type: CareType
  labelKey: CareType
  icon: keyof typeof MaterialIcons.glyphMap
}

const CARE_TYPES: ReadonlyArray<CareTypeDefinition> = [
  { type: 'watering', labelKey: 'watering', icon: 'water-drop' },
  { type: 'fertilization', labelKey: 'fertilization', icon: 'eco' },
  { type: 'misting', labelKey: 'misting', icon: 'grain' },
  { type: 'repotting', labelKey: 'repotting', icon: 'compost' },
]

export function CareTypeChips({
  value,
  onValueChange,
  label,
}: CareTypeToggleProps) {
  const { t } = useTranslation('logCare')
  const iconColors = useIconColors()
  const displayLabel = Option.getOrElse(Option.fromNullishOr(label), () =>
    t('careType')
  )

  return (
    <View className="mb-6">
      {displayLabel && (
        <Text className="text-sm mb-2 font-bold text-text-muted dark:text-slate-400 ml-1">
          {displayLabel}
        </Text>
      )}
      {/* Icon above label: four side-by-side pills clipped the French labels. */}
      <View className="flex-row gap-2">
        {pipe(
          CARE_TYPES,
          Array.map((careType) => {
            const isSelected = value === careType.type
            return (
              <Pressable
                key={careType.type}
                onPress={() => onValueChange(careType.type)}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                className={`flex-1 items-center justify-center gap-1 rounded-2xl py-3 ${
                  isSelected
                    ? 'bg-primary'
                    : 'bg-surface-tinted dark:bg-slate-800'
                }`}
              >
                <MaterialIcons
                  name={careType.icon}
                  size={20}
                  color={isSelected ? iconColors.white : iconColors.textMuted}
                />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  className={`text-xs font-bold ${
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
