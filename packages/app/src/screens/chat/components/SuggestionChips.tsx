import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void
  plantId?: string
}

interface Suggestion {
  text: string
  icon: keyof typeof MaterialIcons.glyphMap
}

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { text: 'Why are my leaves yellowing?', icon: 'help' },
  { text: 'How often should I water?', icon: 'water-drop' },
  { text: 'Is this light okay?', icon: 'light-mode' },
  { text: 'Is it safe for pets?', icon: 'pets' },
]

const PLANT_SUGGESTIONS: Suggestion[] = [
  { text: 'How to care for this plant?', icon: 'eco' },
  { text: "What's wrong with my plant?", icon: 'help' },
  { text: 'When to repot?', icon: 'yard' },
  { text: 'Propagation tips', icon: 'content-cut' },
]

export function SuggestionChips({ onSelect, plantId }: SuggestionChipsProps) {
  const suggestions = plantId ? PLANT_SUGGESTIONS : DEFAULT_SUGGESTIONS
  const iconColors = useIconColors()

  return (
    <View className="py-2 px-4">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {pipe(
          suggestions,
          Array.map((suggestion) => (
            <Pressable
              key={suggestion.text}
              onPress={() => onSelect(suggestion.text)}
              className="flex-row items-center gap-2 px-4 py-2.5 rounded-xl bg-surface dark:bg-surface-dark border border-border dark:border-slate-700"
            >
              <MaterialIcons
                name={suggestion.icon}
                size={18}
                color={iconColors.textMuted}
              />
              <Text className="text-sm font-medium text-text-primary dark:text-white">
                {suggestion.text}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  )
}
