import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'
import {
  type CareEvent,
  CareEventCard,
  type CareEventType,
  getEventConfig,
} from '@/screens/care-history/components/CareEventCard'

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

  const lineColor = iconColors.isDark
    ? 'rgba(155, 199, 109, 0.4)'
    : 'rgba(120, 165, 90, 0.4)'
  const borderColor = iconColors.background

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
            <Text
              className="text-xl font-bold text-text-primary dark:text-white mb-4"
              style={{ marginTop: groupIndex > 0 ? 8 : 0 }}
            >
              {group.date}
            </Text>

            {pipe(
              group.events,
              Array.map((event) => {
                const config = getEventConfig(event.type, iconColors.isDark)
                const currentGlobalIndex = globalEventIndex
                globalEventIndex++
                const isLastEvent = currentGlobalIndex === totalEvents - 1

                return (
                  <View key={event.id} className="flex-row gap-4 relative">
                    <View className="items-center w-10">
                      <View
                        className="w-0.5 h-6"
                        style={{
                          backgroundColor:
                            currentGlobalIndex === 0
                              ? 'transparent'
                              : lineColor,
                        }}
                      />

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
