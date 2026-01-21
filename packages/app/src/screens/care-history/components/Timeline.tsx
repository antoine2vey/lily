import { Array, pipe } from 'effect'
import { Text, View } from 'react-native'
import { iconColors } from 'src/theme'
import { CareEventCard } from './CareEventCard'

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

interface TimelineGroup {
  date: string
  events: CareEvent[]
}

interface TimelineProps {
  groups: TimelineGroup[]
  onEventPress: (event: CareEvent) => void
}

const getEventColor = (type: CareEventType): string => {
  const colorMap: Record<CareEventType, string> = {
    water: iconColors.waterBlue,
    fertilize: iconColors.fertilizerOrange,
    prune: iconColors.pruneRed,
    rotate: '#9C27B0',
    mist: iconColors.mistTeal,
    repot: '#8D6E63',
  }
  return colorMap[type]
}

export function Timeline({ groups, onEventPress }: TimelineProps) {
  const totalGroups = groups.length

  return (
    <View>
      {pipe(
        groups,
        Array.map((group, groupIndex) => (
          <View key={group.date}>
            <Text
              className="text-lg mb-3 font-semibold text-text-primary"
              style={{
                marginTop: groupIndex > 0 ? 24 : 0,
              }}
            >
              {group.date}
            </Text>
            {pipe(
              group.events,
              Array.map((event, eventIndex) => {
                const isLastInGroup = eventIndex === group.events.length - 1
                const isLastGroup = groupIndex === totalGroups - 1
                const showLine = !(isLastInGroup && isLastGroup)

                return (
                  <View key={event.id} className="flex-row mb-3">
                    {/* Timeline indicator */}
                    <View className="items-center" style={{ width: 24 }}>
                      <View
                        className="w-3 h-3 rounded-full z-10"
                        style={{ backgroundColor: getEventColor(event.type) }}
                      />
                      {showLine && (
                        <View
                          className="flex-1 w-0.5 absolute top-3 bg-border"
                          style={{
                            height: '100%',
                            minHeight: 60,
                          }}
                        />
                      )}
                    </View>
                    {/* Event card */}
                    <CareEventCard
                      event={event}
                      onPress={() => onEventPress(event)}
                    />
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
