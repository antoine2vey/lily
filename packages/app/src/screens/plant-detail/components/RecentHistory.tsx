import { type DateInput, formatRelativeTime, parseApiDate } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import { Text, View } from 'react-native'
import { SectionHeader } from 'src/components/SectionHeader'
import { useIconColors } from 'src/hooks/useIconColors'

type EventType = 'watered' | 'fertilized' | 'misted' | 'pruned' | 'repotted'

interface HistoryEvent {
  id: string
  type: EventType
  date: DateInput
  notes?: string
}

interface RecentHistoryProps {
  events: ReadonlyArray<HistoryEvent>
  onViewAll: () => void
}

interface EventConfig {
  color: string
  label: string
}

const getEventConfig = (
  type: EventType,
  iconColors: ReturnType<typeof useIconColors>
): EventConfig =>
  pipe(
    Match.value(type),
    Match.when('watered', () => ({
      color: iconColors.waterBlue,
      label: 'Watered',
    })),
    Match.when('fertilized', () => ({
      color: iconColors.fertilizerOrange,
      label: 'Fertilized',
    })),
    Match.when('misted', () => ({
      color: iconColors.mistTeal,
      label: 'Misted',
    })),
    Match.when('pruned', () => ({
      color: iconColors.pruneRed,
      label: 'Pruned',
    })),
    Match.when('repotted', () => ({
      color: '#9C27B0',
      label: 'Repotted',
    })),
    Match.exhaustive
  )

const formatDate = (date: DateInput): string =>
  pipe(
    parseApiDate(date),
    Option.map(formatRelativeTime),
    Option.getOrElse(() => 'Unknown')
  )

export function RecentHistory({ events, onViewAll }: RecentHistoryProps) {
  const iconColors = useIconColors()
  const recentEvents = Array.take(events, 3)

  return (
    <View testID="recent-history">
      <SectionHeader
        title="Recent History"
        action={{ label: 'View All', onPress: onViewAll }}
      />
      <View className="mt-4">
        {Array.length(recentEvents) === 0 ? (
          <Text
            className="text-sm py-4 text-center font-regular text-text-muted dark:text-slate-400"
            testID="no-history"
          >
            No care history yet
          </Text>
        ) : (
          Array.map(recentEvents, (event) => {
            const config = getEventConfig(event.type, iconColors)
            return (
              <View
                key={event.id}
                className="flex-row items-center py-1.5"
                testID={`history-event-${event.id}`}
              >
                <View
                  className="w-2 h-2 rounded-full mr-3"
                  style={{ backgroundColor: config.color }}
                />
                <View className="flex-1">
                  <Text className="text-base font-medium text-text-primary dark:text-white">
                    {config.label}
                  </Text>
                  {event.notes && (
                    <Text
                      className="text-xs mt-0.5 font-regular text-text-muted dark:text-slate-400"
                      numberOfLines={1}
                    >
                      {event.notes}
                    </Text>
                  )}
                </View>
                <Text className="text-sm font-regular text-text-muted dark:text-slate-400">
                  {formatDate(event.date)}
                </Text>
              </View>
            )
          })
        )}
      </View>
    </View>
  )
}
