import type { MaterialIcons } from '@expo/vector-icons'
import { formatApiTime } from '@lily/shared'
import { Match, pipe } from 'effect'
import { Image, Pressable, Text, View } from 'react-native'

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
  photoUrl?: string
}

interface CareEventCardProps {
  event: CareEvent
  onPress: () => void
}

interface EventConfig {
  icon: keyof typeof MaterialIcons.glyphMap
  bgColor: string
  iconColor: string
  label: string
}

const getEventConfig = (type: CareEventType, isDark = false): EventConfig =>
  pipe(
    Match.value(type),
    Match.when('water', () => ({
      icon: 'water-drop' as const,
      bgColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE', // blue-100
      iconColor: isDark ? '#93C5FD' : '#3B82F6', // blue-500/300
      label: 'Watered',
    })),
    Match.when('fertilize', () => ({
      icon: 'eco' as const,
      bgColor: isDark ? 'rgba(91, 140, 90, 0.2)' : '#D1FAE5', // green-100
      iconColor: isDark ? '#9bc76d' : '#5B8C5A', // primary green
      label: 'Fertilized',
    })),
    Match.when('prune', () => ({
      icon: 'content-cut' as const,
      bgColor: isDark ? 'rgba(234, 88, 12, 0.2)' : '#FFEDD5', // orange-100
      iconColor: isDark ? '#FB923C' : '#EA580C', // orange-600/400
      label: 'Pruned',
    })),
    Match.when('rotate', () => ({
      icon: 'rotate-right' as const,
      bgColor: isDark ? 'rgba(147, 51, 234, 0.2)' : '#F3E8FF', // purple-100
      iconColor: isDark ? '#C084FC' : '#9333EA', // purple-600/400
      label: 'Rotated',
    })),
    Match.when('mist', () => ({
      icon: 'water' as const,
      bgColor: isDark ? 'rgba(8, 145, 178, 0.2)' : '#CFFAFE', // cyan-100
      iconColor: isDark ? '#22D3EE' : '#0891B2', // cyan-600/400
      label: 'Misted',
    })),
    Match.when('repot', () => ({
      icon: 'yard' as const,
      bgColor: isDark ? 'rgba(146, 64, 14, 0.2)' : '#FEF3C7', // amber-100
      iconColor: isDark ? '#FBBF24' : '#92400E', // amber-800/400
      label: 'Repotted',
    })),
    Match.exhaustive
  )

export function CareEventCard({ event, onPress }: CareEventCardProps) {
  const config = getEventConfig(event.type)
  const hasPhoto = !!event.photoUrl

  return (
    <Pressable
      onPress={onPress}
      className="flex-1 p-4 rounded-xl bg-surface-tinted dark:bg-surface-dark shadow-sm"
      style={({ pressed }) => ({
        opacity: pressed ? 0.95 : 1,
      })}
    >
      {/* Header row with title and time */}
      <View className="flex-row justify-between items-baseline mb-2">
        <Text className="text-lg font-bold text-text-primary dark:text-white">
          {config.label}
        </Text>
        <Text className="text-sm font-medium text-text-muted dark:text-slate-400">
          {formatApiTime(event.createdAt)}
        </Text>
      </View>

      {/* Notes */}
      {event.notes && (
        <Text
          className={`text-sm font-regular text-text-muted dark:text-slate-400 ${hasPhoto ? 'mb-3' : ''}`}
          numberOfLines={3}
        >
          {event.notes}
        </Text>
      )}

      {/* Photo if present */}
      {event.photoUrl && (
        <View
          className="w-full h-32 rounded-xl overflow-hidden shadow-sm"
          style={{ borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.4)' }}
        >
          <Image
            source={{ uri: event.photoUrl }}
            className="w-full h-full"
            resizeMode="cover"
          />
        </View>
      )}
    </Pressable>
  )
}

export { getEventConfig }
export type { CareEvent, CareEventType }
