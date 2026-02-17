import { View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from 'src/components/skeletons/Skeleton'

export function PlantCardSkeleton() {
  return (
    <View className="overflow-hidden rounded-xl bg-white dark:bg-surface-dark shadow-soft">
      <View className="p-3 gap-3">
        <SkeletonBox width="100%" height={150} rounded="lg" />
        <View>
          <SkeletonBox width="80%" height={16} rounded="sm" className="mb-1" />
          <View className="flex-row items-center gap-1">
            <SkeletonCircle size={14} />
            <SkeletonBox width={50} height={12} rounded="sm" />
          </View>
        </View>
      </View>
    </View>
  )
}
