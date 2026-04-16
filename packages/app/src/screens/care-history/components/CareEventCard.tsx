import type { MaterialIcons } from '@expo/vector-icons'
import { formatApiTime } from '@lily/shared'
import { Match, pipe } from 'effect'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { AnimatedImage } from '@/components/AnimatedImage'

type CareEventType =
  | 'watering'
  | 'fertilization'
  | 'misting'
  | 'repotting'
  | 'prune'
  | 'rotate'

interface CareEvent {
  id: string
  type: CareEventType
  notes?: string | undefined
  createdAt: string
  photoUrl?: string | undefined
}

interface CareEventCardProps {
  event: CareEvent
  onPress: () => void
}

interface EventConfig {
  icon: keyof typeof MaterialIcons.glyphMap
  bgColor: string
  iconColor: string
  labelKey:
    | 'watering'
    | 'fertilization'
    | 'misting'
    | 'repotting'
    | 'prune'
    | 'rotate'
}

const getEventConfig = (type: CareEventType, isDark = false): EventConfig =>
  pipe(
    Match.value(type),
    Match.when('watering', () => ({
      icon: 'water-drop' as const,
      bgColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE',
      iconColor: isDark ? '#93C5FD' : '#3B82F6',
      labelKey: 'watering' as const,
    })),
    Match.when('fertilization', () => ({
      icon: 'eco' as const,
      bgColor: isDark ? 'rgba(91, 140, 90, 0.2)' : '#D1FAE5',
      iconColor: isDark ? '#9bc76d' : '#5B8C5A',
      labelKey: 'fertilization' as const,
    })),
    Match.when('misting', () => ({
      icon: 'grain' as const,
      bgColor: isDark ? 'rgba(8, 145, 178, 0.2)' : '#CFFAFE',
      iconColor: isDark ? '#22D3EE' : '#0891B2',
      labelKey: 'misting' as const,
    })),
    Match.when('repotting', () => ({
      icon: 'compost' as const,
      bgColor: isDark ? 'rgba(146, 64, 14, 0.2)' : '#FEF3C7',
      iconColor: isDark ? '#FBBF24' : '#92400E',
      labelKey: 'repotting' as const,
    })),
    Match.when('prune', () => ({
      icon: 'content-cut' as const,
      bgColor: isDark ? 'rgba(234, 88, 12, 0.2)' : '#FFEDD5',
      iconColor: isDark ? '#FB923C' : '#EA580C',
      labelKey: 'prune' as const,
    })),
    Match.when('rotate', () => ({
      icon: 'rotate-right' as const,
      bgColor: isDark ? 'rgba(147, 51, 234, 0.2)' : '#F3E8FF',
      iconColor: isDark ? '#C084FC' : '#9333EA',
      labelKey: 'rotate' as const,
    })),
    Match.exhaustive
  )

const getEventLabel = (
  labelKey: EventConfig['labelKey'],
  t: TFunction
): string => t(`types.${labelKey}.completed`)

export function CareEventCard({ event, onPress }: CareEventCardProps) {
  const { t } = useTranslation('care')
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
          {getEventLabel(config.labelKey, t)}
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
          <AnimatedImage
            source={{ uri: event.photoUrl }}
            className="w-full h-full"
          />
        </View>
      )}
    </Pressable>
  )
}

export { getEventConfig }
export type { CareEvent, CareEventType }
