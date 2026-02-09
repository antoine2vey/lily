import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'
import {
  type CareEvent,
  CareEventCard,
  type CareEventType,
  getEventConfig,
} from 'src/screens/care-history/components/CareEventCard'

interface TimelineGroup {
  date: string
  events: CareEvent[]
}

interface TimelineProps {
  groups: TimelineGroup[]
  onEventPress: (event: CareEvent) => void
  testID?: string
}

export function Timeline({ groups, onEventPress, testID }: TimelineProps) {
  const iconColors = useIconColors()

  // Theme-aware colors for timeline
  const lineColor = iconColors.isDark
    ? 'rgba(155, 199, 109, 0.4)'
    : 'rgba(120, 165, 90, 0.4)'
  const borderColor = iconColors.background

  // Calculate total events for line rendering
  const allEvents = pipe(
    groups,
    Array.flatMap((g) => g.events)
  )
  const totalEvents = Array.length(allEvents)

  let globalEventIndex = 0

  return (
    <View testID={testID}>
      {pipe(
        groups,
        Array.map((group, groupIndex) => (
          <View key={group.date} className="mb-2">
            {/* Date header */}
            <Text
              className="text-xl font-bold text-text-primary dark:text-white mb-4"
              style={{ marginTop: groupIndex > 0 ? 8 : 0 }}
            >
              {group.date}
            </Text>

            {/* Events */}
            {pipe(
              group.events,
              Array.map((event) => {
                const config = getEventConfig(event.type, iconColors.isDark)
                const currentGlobalIndex = globalEventIndex
                globalEventIndex++
                const isLastEvent = currentGlobalIndex === totalEvents - 1

                return (
                  <View key={event.id} className="flex-row gap-4 relative">
                    {/* Timeline column */}
                    <View className="items-center w-10">
                      {/* Top line segment */}
                      <View
                        className="w-0.5 h-6"
                        style={{
                          backgroundColor:
                            currentGlobalIndex === 0
                              ? 'transparent'
                              : lineColor,
                        }}
                      />

                      {/* Icon circle with ring */}
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center z-10"
                        style={{
                          backgroundColor: config.bgColor,
                          borderWidth: 4,
                          borderColor: borderColor,
                        }}
                      >
                        <MaterialIcons
                          name={config.icon}
                          size={20}
                          color={config.iconColor}
                        />
                      </View>

                      {/* Bottom line segment */}
                      <View
                        className="w-0.5 flex-1"
                        style={{
                          backgroundColor: isLastEvent
                            ? 'transparent'
                            : lineColor,
                          minHeight: 48,
                        }}
                      />
                    </View>

                    {/* Card column */}
                    <View className="flex-1 pb-6 pt-1">
                      <CareEventCard
                        event={event}
                        onPress={() => onEventPress(event)}
                      />
                    </View>
                  </View>
                )
              })
            )}
          </View>
        ))
      )}
    </View>
  )
}

export type { CareEvent, CareEventType, TimelineGroup }
