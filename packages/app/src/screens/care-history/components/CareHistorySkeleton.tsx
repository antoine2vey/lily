import { Array, pipe } from 'effect'
import { Text, View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'

interface TimelineEventSkeletonProps {
  isFirst: boolean
  isLast: boolean
  hasNotes: boolean
  hasPhoto: boolean
}

// Mirrors a single Timeline event row:
//   <View className="flex-row gap-4 relative">
//     <View className="items-center w-10"> top line / icon circle / bottom line
//     <View className="flex-1 pb-6 pt-1"> CareEventCard
function TimelineEventSkeleton({
  isFirst,
  isLast,
  hasNotes,
  hasPhoto,
}: TimelineEventSkeletonProps) {
  // Line color matches the muted connector; transparent at the ends like the
  // real Timeline (first event has no top segment, last has no bottom segment).
  const lineClass = 'w-0.5 bg-border/40 dark:bg-slate-700/40'

  return (
    <View className="flex-row gap-4 relative">
      {/* Timeline column (mirrors items-center w-10) */}
      <View className="items-center w-10">
        {/* Top line segment: w-0.5 h-6 (transparent for first event) */}
        <View className={`h-6 ${isFirst ? 'w-0.5' : lineClass}`} />

        {/* Icon circle: w-10 h-10 rounded-full (40px), real has 4px ring */}
        <SkeletonCircle size={40} />

        {/* Bottom line segment: w-0.5 flex-1 minHeight 48 (transparent if last) */}
        <View
          className={`flex-1 ${isLast ? 'w-0.5' : lineClass}`}
          style={{ minHeight: 48 }}
        />
      </View>

      {/* Card column (mirrors flex-1 pb-6 pt-1) */}
      <View className="flex-1 pb-6 pt-1">
        {/* CareEventCard: flex-1 p-4 rounded-xl bg-surface-tinted shadow-sm */}
        <View className="flex-1 p-4 rounded-xl bg-surface-tinted dark:bg-surface-dark shadow-sm">
          {/* Header row: title (text-lg font-bold) + time (text-sm), mb-2 */}
          <View className="flex-row justify-between items-baseline mb-2">
            <SkeletonBox width={110} height={20} rounded="sm" />
            <SkeletonBox width={56} height={14} rounded="sm" />
          </View>

          {/* Notes (optional): text-sm, mb-3 when a photo follows */}
          {hasNotes && (
            <View className={hasPhoto ? 'mb-3' : ''}>
              <SkeletonBox width="100%" height={14} rounded="sm" />
              <View className="mt-1">
                <SkeletonBox width="80%" height={14} rounded="sm" />
              </View>
            </View>
          )}

          {/* Photo (optional): w-full h-32 rounded-xl */}
          {hasPhoto && <SkeletonBox width="100%" height={128} rounded="xl" />}
        </View>
      </View>
    </View>
  )
}

interface GroupConfig {
  id: string
  // Event rows in the group.
  events: ReadonlyArray<{ id: string; hasNotes: boolean; hasPhoto: boolean }>
}

// Two date-grouped sections mirroring the real Timeline grouping.
const GROUPS: ReadonlyArray<GroupConfig> = [
  {
    id: 'group-1',
    events: [
      { id: 'g1-e1', hasNotes: true, hasPhoto: false },
      { id: 'g1-e2', hasNotes: false, hasPhoto: true },
      { id: 'g1-e3', hasNotes: true, hasPhoto: false },
    ],
  },
  {
    id: 'group-2',
    events: [
      { id: 'g2-e1', hasNotes: false, hasPhoto: false },
      { id: 'g2-e2', hasNotes: true, hasPhoto: false },
    ],
  },
]

const TOTAL_EVENTS = pipe(
  GROUPS,
  Array.map((g) => g.events.length),
  Array.reduce(0, (acc, n) => acc + n)
)

export function CareHistorySkeleton() {
  let globalIndex = 0

  return (
    <View>
      {pipe(
        GROUPS,
        Array.map((group, groupIndex) => (
          <View key={group.id} className="mb-2">
            {/* Date header: mirrors text-xl font-bold mb-4 (marginTop 8 after first) */}
            <Text
              className="mb-4"
              style={{ marginTop: groupIndex > 0 ? 8 : 0 }}
            >
              <SkeletonBox width={140} height={24} rounded="sm" />
            </Text>

            {pipe(
              group.events,
              Array.map((event) => {
                const currentIndex = globalIndex
                globalIndex++

                return (
                  <TimelineEventSkeleton
                    key={event.id}
                    isFirst={currentIndex === 0}
                    isLast={currentIndex === TOTAL_EVENTS - 1}
                    hasNotes={event.hasNotes}
                    hasPhoto={event.hasPhoto}
                  />
                )
              })
            )}
          </View>
        ))
      )}
    </View>
  )
}
