import { Array, pipe } from 'effect'
import { ScrollView, View } from 'react-native'
import { Chip } from 'src/components/Chip'

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void
  plantId?: string
}

const DEFAULT_SUGGESTIONS = [
  'How often should I water?',
  'Why are my leaves yellow?',
  'Best light conditions?',
  'Is it safe for pets?',
]

const PLANT_SUGGESTIONS = [
  'How to care for this plant?',
  "What's wrong with my plant?",
  'When to repot?',
  'Propagation tips',
]

export function SuggestionChips({ onSelect, plantId }: SuggestionChipsProps) {
  const suggestions = plantId ? PLANT_SUGGESTIONS : DEFAULT_SUGGESTIONS

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
            <Chip
              key={suggestion}
              label={suggestion}
              variant="suggestion"
              onPress={() => onSelect(suggestion)}
            />
          ))
        )}
      </ScrollView>
    </View>
  )
}
