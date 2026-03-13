import { View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from 'src/components/skeletons/Skeleton'

export function PlantCardSkeleton() {
  return (
    <View className="flex-row items-center p-3 rounded-xl bg-white dark:bg-surface-dark shadow-soft">
      <SkeletonBox width={64} height={64} rounded="lg" />
      <View className="flex-1 ml-3">
        <SkeletonBox width="70%" height={16} rounded="sm" />
        <View className="mt-1.5">
          <SkeletonBox width="40%" height={12} rounded="sm" />
        </View>
        <View className="flex-row items-center gap-3 mt-1.5">
          <SkeletonBox width={60} height={12} rounded="sm" />
          <SkeletonBox width={60} height={12} rounded="sm" />
        </View>
      </View>
    </View>
  )
}
