import { MaterialIcons } from '@expo/vector-icons'
import { formatApiTime } from '@lily/shared'
import { Match, pipe } from 'effect'
import { Pressable, Text, View } from 'react-native'
import { iconColors } from 'src/theme'

type CareEventType =
  | 'water'
  | 'fertilize'
  | 'prune'
  | 'rotate'
  | 'mist'
  | 'repot'

interface CareEvent {
  id: string
  type: CareEventType
  notes?: string
  createdAt: string
}

interface CareEventCardProps {
  event: CareEvent
  onPress: () => void
}

interface EventConfig {
  icon: keyof typeof MaterialIcons.glyphMap
  color: string
  label: string
}

const getEventConfig = (type: CareEventType): EventConfig =>
  pipe(
    Match.value(type),
    Match.when('water', () => ({
      icon: 'water-drop' as const,
      color: iconColors.waterBlue,
      label: 'Watered',
    })),
    Match.when('fertilize', () => ({
      icon: 'eco' as const,
      color: iconColors.fertilizerOrange,
      label: 'Fertilized',
    })),
    Match.when('prune', () => ({
      icon: 'content-cut' as const,
      color: iconColors.pruneRed,
      label: 'Pruned',
    })),
    Match.when('rotate', () => ({
      icon: 'rotate-right' as const,
      color: '#9C27B0',
      label: 'Rotated',
    })),
    Match.when('mist', () => ({
      icon: 'cloud' as const,
      color: iconColors.mistTeal,
      label: 'Misted',
    })),
    Match.when('repot', () => ({
      icon: 'yard' as const,
      color: '#8D6E63',
      label: 'Repotted',
    })),
    Match.exhaustive
  )

export function CareEventCard({ event, onPress }: CareEventCardProps) {
  const config = getEventConfig(event.type)

  return (
    <Pressable
      onPress={onPress}
      className="flex-1 p-3 rounded-xl ml-3 bg-surface"
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View className="flex-row items-center">
        <View
          className="w-8 h-8 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: `${config.color}20` }}
        >
          <MaterialIcons name={config.icon} size={16} color={config.color} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-medium text-text-primary">
            {config.label}
          </Text>
          <Text className="text-xs font-regular text-text-muted">
            {formatApiTime(event.createdAt)}
          </Text>
        </View>
      </View>
      {event.notes && (
        <Text
          className="text-sm mt-2 font-regular text-text-secondary"
          numberOfLines={2}
        >
          {event.notes}
        </Text>
      )}
    </Pressable>
  )
}
