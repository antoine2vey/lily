import { Array } from 'effect'
import { Pressable, ScrollView, Text } from 'react-native'

const ROOM_EMOJIS = [
  '🏠',
  '🛋️',
  '🍳',
  '🛏️',
  '🛁',
  '🪴',
  '🌿',
  '☀️',
  '🏢',
  '📚',
  '🎮',
  '🧸',
  '🧹',
  '🪟',
  '🌤️',
  '🏡',
] as const

interface EmojiPickerProps {
  value: string
  onSelect: (emoji: string) => void
}

export function EmojiPicker({ value, onSelect }: EmojiPickerProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {Array.map(ROOM_EMOJIS, (emoji) => {
        const isSelected = value === emoji
        return (
          <Pressable
            key={emoji}
            onPress={() => onSelect(emoji)}
            className={`w-12 h-12 rounded-xl items-center justify-center ${
              isSelected
                ? 'bg-primary/15 border-2 border-primary'
                : 'bg-surface-tinted dark:bg-slate-700'
            }`}
          >
            <Text className="text-xl">{emoji}</Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
