import { View } from 'react-native'
import { SkeletonBox } from '@/components/skeletons/Skeleton'

export function PlantCardSkeleton() {
  return (
    <View className="flex-row items-center p-3 rounded-xl bg-white dark:bg-surface-dark shadow-soft">
      {/* Image wrapper (mirrors real w-16 h-16 rounded-lg) */}
      <View className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 dark:bg-slate-700">
        {/* Health dot (always rendered on the real card) */}
        <View className="absolute top-1 right-1 z-10 w-2.5 h-2.5 rounded-full bg-gray-200 dark:bg-slate-600 ring-1 ring-white" />
      </View>

      {/* Content (mirrors real flex-1 ml-3) */}
      <View className="flex-1 ml-3">
        {/* Name row (text-base font-bold, flex-1) */}
        <View className="flex-row items-center gap-1.5">
          <SkeletonBox width="70%" height={16} rounded="sm" />
        </View>

        {/* One representative metadata line (owner or room: icon + xs text) */}
        <View className="mt-1 flex-row items-center gap-1">
          <SkeletonBox width={12} height={12} rounded="sm" />
          <SkeletonBox width="40%" height={12} rounded="sm" />
        </View>

        {/* Care indicators: one representative row of 2 badges (mt-1 gap-0.5) */}
        <View className="mt-1 gap-0.5">
          <View className="flex-row items-center gap-3">
            <View className="flex-row items-center gap-1">
              <SkeletonBox width={14} height={14} rounded="sm" />
              <SkeletonBox width={50} height={12} rounded="sm" />
            </View>
            <View className="flex-row items-center gap-1">
              <SkeletonBox width={14} height={14} rounded="sm" />
              <SkeletonBox width={50} height={12} rounded="sm" />
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
