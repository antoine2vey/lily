import { Array } from 'effect'
import { View } from 'react-native'
import { SkeletonBox } from '@/components/skeletons'

// Mirrors NotificationsScreen rows: grouped under date/section headers
// (px-6 pt-4 pb-1, text-[11px] uppercase) with notification rows
// (flex-row items-start gap-3 px-6 py-3): 40px icon circle, a flex-1
// content column (title text-sm, body text-xs mt-0.5 up to 2 lines,
// timestamp text-[11px] mt-1) and an optional unread badge
// (w-2.5 h-2.5 rounded-full mt-1.5).

type RowSpec = {
  readonly id: number
  readonly titleWidth: `${number}%`
  readonly bodyLines: readonly `${number}%`[]
  readonly timeWidth: `${number}%`
  readonly unread: boolean
}

type SectionSpec = {
  readonly id: number
  readonly headerWidth: `${number}%`
  readonly rows: readonly RowSpec[]
}

const SECTIONS: readonly SectionSpec[] = [
  {
    id: 1,
    headerWidth: '24%',
    rows: [
      {
        id: 1,
        titleWidth: '62%',
        bodyLines: ['100%', '78%'],
        timeWidth: '30%',
        unread: true,
      },
      {
        id: 2,
        titleWidth: '70%',
        bodyLines: ['88%'],
        timeWidth: '34%',
        unread: false,
      },
    ],
  },
  {
    id: 2,
    headerWidth: '30%',
    rows: [
      {
        id: 3,
        titleWidth: '55%',
        bodyLines: ['100%', '64%'],
        timeWidth: '28%',
        unread: false,
      },
      {
        id: 4,
        titleWidth: '66%',
        bodyLines: ['82%'],
        timeWidth: '32%',
        unread: false,
      },
      {
        id: 5,
        titleWidth: '60%',
        bodyLines: ['95%', '70%'],
        timeWidth: '30%',
        unread: false,
      },
    ],
  },
]

function NotificationRowSkeleton({ row }: { row: RowSpec }) {
  return (
    // Representative read-state background (bg-background dark:bg-background-dark)
    // mirrors NotificationRow's read branch, preventing fade-in layout shift.
    <View className="flex-row items-start gap-3 px-6 py-3 bg-background dark:bg-background-dark">
      {/* Icon container — mirrors w-10 h-10 rounded-full items-center
          justify-center; the colored ${iconColor}20 background is dynamic per
          notification type, so the shimmer fills the circle as placeholder. */}
      <View className="w-10 h-10 rounded-full items-center justify-center">
        <SkeletonBox width={40} height={40} rounded="full" />
      </View>
      {/* Content column — mirrors flex-1 (title + body + timestamp) */}
      <View className="flex-1">
        {/* Title — text-sm numberOfLines={1} */}
        <SkeletonBox width={row.titleWidth} height={14} rounded="sm" />
        {/* Body — text-xs mt-0.5 numberOfLines={2} */}
        {Array.map(row.bodyLines, (lineWidth) => (
          <View key={lineWidth} className="mt-0.5">
            <SkeletonBox width={lineWidth} height={12} rounded="sm" />
          </View>
        ))}
        {/* Timestamp — text-[11px] mt-1 */}
        <View className="mt-1">
          <SkeletonBox width={row.timeWidth} height={11} rounded="sm" />
        </View>
      </View>
      {/* Unread badge — mirrors w-2.5 h-2.5 rounded-full bg-primary mt-1.5
          (solid primary dot, not a shimmer placeholder) */}
      {row.unread ? (
        <View className="w-2.5 h-2.5 rounded-full bg-primary mt-1.5" />
      ) : null}
    </View>
  )
}

export function NotificationsSkeleton() {
  return (
    <View>
      {Array.map(SECTIONS, (section) => (
        <View key={section.id}>
          {/* Section header — mirrors px-6 pt-4 pb-1, text-[11px] */}
          <View className="px-6 pt-4 pb-1">
            <SkeletonBox width={section.headerWidth} height={11} rounded="sm" />
          </View>
          {Array.map(section.rows, (row) => (
            <NotificationRowSkeleton key={row.id} row={row} />
          ))}
        </View>
      ))}
    </View>
  )
}
