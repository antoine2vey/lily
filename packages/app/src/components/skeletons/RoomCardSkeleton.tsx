import { View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons/Skeleton'

export function RoomCardSkeleton() {
  return (
    <View className="flex-row items-center p-4 mb-2 bg-surface dark:bg-surface-dark rounded-xl">
      <SkeletonCircle size={24} className="mr-3" />
      <View className="flex-1">
        <SkeletonBox width="50%" height={16} rounded="sm" />
        <View className="flex-row items-center gap-2 mt-0.5">
          <SkeletonBox width={70} height={14} rounded="sm" />
          <SkeletonBox width={90} height={14} rounded="sm" />
        </View>
      </View>
      <SkeletonBox width={20} height={20} rounded="sm" />
    </View>
  )
}
