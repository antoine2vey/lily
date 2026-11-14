import { Array, Match, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import {
  type PlantSuggestions,
  useChatSuggestions,
} from '@/hooks/useChatSuggestions'
import { chipEntering } from '@/screens/chat/components/chat-motion'
import { PressableScale } from '@/screens/chat/components/PressableScale'
import type { ChipsSubject } from '@/screens/chat/new-chat-target'

const GENERAL_KEYS = [
  'suggestions.general.petSafePlants',
  'suggestions.general.lowLight',
  'suggestions.general.fungusGnats',
  'suggestions.general.beginnerPlants',
] as const

const PLANT_FALLBACK_KEYS = [
  'suggestions.plant.howToCare',
  'suggestions.plant.whatIsWrong',
  'suggestions.plant.whenToRepot',
  'suggestions.plant.propagationTips',
] as const

interface Chip {
  readonly key: string
  readonly text: string
}

interface SuggestionChipsProps {
  subject: ChipsSubject
  onSelect: (text: string) => void
}

export function SuggestionChips({ subject, onSelect }: SuggestionChipsProps) {
  return subject.kind === 'plant' ? (
    <PlantChips plantId={subject.plantId} onSelect={onSelect} />
  ) : (
    <GeneralChips onSelect={onSelect} />
  )
}

function GeneralChips({ onSelect }: { onSelect: (text: string) => void }) {
  const { t } = useTranslation('chat')
  return (
    <ChipList
      chips={Array.map(GENERAL_KEYS, (key) => ({ key, text: t(key) }))}
      onSelect={onSelect}
    />
  )
}

function PlantChips({
  plantId,
  onSelect,
}: {
  plantId: string
  onSelect: (text: string) => void
}) {
  const { t } = useTranslation('chat')
  const suggestions = useChatSuggestions(plantId)
  const chips = pipe(
    Match.type<PlantSuggestions>(),
    Match.withReturnType<ReadonlyArray<Chip>>(),
    Match.tag('Loading', () => []),
    Match.tag('Loaded', ({ suggestions }) =>
      Array.map(suggestions, ({ id, text }) => ({
        key: `${plantId}:${id}`,
        text,
      }))
    ),
    Match.tag('Failed', () =>
      Array.map(PLANT_FALLBACK_KEYS, (key) => ({
        key: `${plantId}:${key}`,
        text: t(key),
      }))
    ),
    Match.exhaustive
  )(suggestions)
  return <ChipList chips={chips} onSelect={onSelect} />
}

function ChipList({
  chips,
  onSelect,
}: {
  chips: ReadonlyArray<Chip>
  onSelect: (text: string) => void
}) {
  return (
    <View className="flex-row flex-wrap justify-center gap-2 px-6 pb-4">
      {Array.map(chips, ({ key, text }, index) => (
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
      ))}
    </View>
  )
}
