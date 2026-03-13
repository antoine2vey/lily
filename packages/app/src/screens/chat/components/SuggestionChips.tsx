import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void
  plantId?: string
}

interface SuggestionConfig {
  key: string
  icon: keyof typeof MaterialIcons.glyphMap
}

const DEFAULT_SUGGESTION_CONFIGS: SuggestionConfig[] = [
  { key: 'leavesYellowing', icon: 'help' },
  { key: 'wateringFrequency', icon: 'water-drop' },
  { key: 'lightOkay', icon: 'light-mode' },
  { key: 'petSafe', icon: 'pets' },
]

const PLANT_SUGGESTION_CONFIGS: SuggestionConfig[] = [
  { key: 'howToCare', icon: 'eco' },
  { key: 'whatIsWrong', icon: 'help' },
  { key: 'whenToRepot', icon: 'compost' },
  { key: 'propagationTips', icon: 'content-cut' },
]

const getSuggestionText = (
  key: string,
  isPlant: boolean,
  t: TFunction
): string => t(`suggestions.${isPlant ? 'plant' : 'default'}.${key}`)

export function SuggestionChips({ onSelect, plantId }: SuggestionChipsProps) {
  const { t } = useTranslation('chat')
  const isPlant = !!plantId
  const suggestionConfigs = isPlant
    ? PLANT_SUGGESTION_CONFIGS
    : DEFAULT_SUGGESTION_CONFIGS
  const iconColors = useIconColors()

  return (
    <View className="py-2 px-4">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {pipe(
          suggestionConfigs,
          Array.map((config) => {
            const text = getSuggestionText(config.key, isPlant, t)
            return (
              <Pressable
                key={config.key}
                onPress={() => onSelect(text)}
                className="flex-row items-center gap-2 px-4 py-2.5 rounded-xl bg-surface dark:bg-surface-dark border border-border dark:border-slate-700"
              >
                <MaterialIcons
                  name={config.icon}
                  size={18}
                  color={iconColors.textMuted}
                />
                <Text className="text-sm font-medium text-text-primary dark:text-white">
                  {text}
                </Text>
              </Pressable>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}
