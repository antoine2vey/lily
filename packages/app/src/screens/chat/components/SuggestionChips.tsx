import { Array } from 'effect'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { chipEntering } from '@/screens/chat/components/chat-motion'
import { PressableScale } from '@/screens/chat/components/PressableScale'

const SUGGESTION_KEYS = {
  plant: [
    'suggestions.plant.howToCare',
    'suggestions.plant.whatIsWrong',
    'suggestions.plant.whenToRepot',
    'suggestions.plant.propagationTips',
  ],
  default: [
    'suggestions.default.leavesYellowing',
    'suggestions.default.wateringFrequency',
    'suggestions.default.lightOkay',
    'suggestions.default.petSafe',
  ],
} as const

interface SuggestionChipsProps {
  isPlantChat: boolean
  onSelect: (text: string) => void
}

export function SuggestionChips({
  isPlantChat,
  onSelect,
}: SuggestionChipsProps) {
  const { t } = useTranslation('chat')

  return (
    <View className="flex-row flex-wrap justify-center gap-2 px-6 pb-4">
      {Array.map(
        SUGGESTION_KEYS[isPlantChat ? 'plant' : 'default'],
        (key, index) => {
          const text = t(key)
          return (
            <Animated.View key={key} entering={chipEntering(index)}>
              <PressableScale
                onPress={() => onSelect(text)}
                accessibilityRole="button"
                surfaceClassName="px-4 py-2.5 rounded-full bg-surface dark:bg-white/10 border border-border dark:border-white/10"
              >
                <Text
                  className="text-sm text-text-primary dark:text-white"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                >
                  {text}
                </Text>
              </PressableScale>
            </Animated.View>
          )
        }
      )}
    </View>
  )
}
