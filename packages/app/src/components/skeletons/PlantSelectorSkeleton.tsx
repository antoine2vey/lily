import { Array } from 'effect'
import { View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons/Skeleton'

export function PlantSelectorSkeleton() {
  return (
    <View className="gap-2">
      {/* Mirrors the section header row: count text (left) + Select All button (right) */}
      <View className="flex-row items-center justify-between ml-1">
        {/* Left: 'Plants: X of Y' count text (text-sm font-semibold) */}
        <SkeletonBox width="40%" height={14} rounded="sm" />
        {/* Right: 'Select All' / 'Deselect All' button (text-sm font-medium) */}
        <SkeletonBox width={64} height={14} rounded="sm" />
      </View>
      {/* Mirrors the gap-2 list of plant rows */}
      <View className="gap-2">
        {Array.map([1, 2, 3], (i) => (
          <View
            key={i}
            className="flex-row items-center p-3 rounded-xl border-2 border-transparent bg-surface dark:bg-surface-dark"
          >
            {/* Avatar size="sm" is a 32px circle */}
            <SkeletonCircle size={32} />
            {/* flex-1 plant name (text-sm) */}
            <View className="flex-1 ml-3">
              <SkeletonBox width="50%" height={14} rounded="sm" />
            </View>
            {/* Trailing 24x24 checkbox (w-6 h-6 rounded-md) */}
            <SkeletonBox width={24} height={24} rounded="md" />
          </View>
        ))}
      </View>
    </View>
  )
}
