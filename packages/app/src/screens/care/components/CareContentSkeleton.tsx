import { View } from 'react-native'
import { CareTaskCardSkeleton, SkeletonBox } from '@/components/skeletons'

export function CareContentSkeleton() {
  return (
    <View className="gap-6">
      {/* Overdue section (real: rendered when overdueCount > 0) */}
      <View>
        <View className="flex-row items-center mb-3">
          {/* SectionHeader title (text-lg ≈ 20px) */}
          <SkeletonBox width={96} height={20} rounded="sm" />
          {/* Coral count badge (ml-2 px-2 py-0.5 rounded-full) */}
          <View className="ml-2">
            <SkeletonBox width={28} height={20} rounded="full" />
          </View>
        </View>
        <CareTaskCardSkeleton />
        <CareTaskCardSkeleton />
      </View>

      {/* Today section (real: rendered when todayCount > 0) */}
      <View>
        {/* SectionHeader title (text-lg ≈ 20px) */}
        <SkeletonBox width={72} height={20} rounded="sm" />
        <View className="mt-3">
          <CareTaskCardSkeleton />
          <CareTaskCardSkeleton />
        </View>
      </View>

      {/* Upcoming section (real: rendered when upcomingCount > 0) */}
      <View>
        {/* SectionHeader title (text-lg ≈ 20px) */}
        <SkeletonBox width={104} height={20} rounded="sm" />
        <View className="mt-3">
          {/* Day group (mb-4) */}
          <View className="mb-4">
            {/* Day-of-week label (text-xs uppercase mb-2) */}
            <SkeletonBox width={70} height={12} rounded="sm" />
            <View className="mt-2">
              <CareTaskCardSkeleton />
              <CareTaskCardSkeleton />
            </View>
          </View>
          {/* Day group (last:mb-0 — no trailing margin) */}
          <View>
            <SkeletonBox width={84} height={12} rounded="sm" />
            <View className="mt-2">
              <CareTaskCardSkeleton />
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
