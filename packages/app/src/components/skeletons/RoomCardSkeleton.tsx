import { View } from 'react-native'
import { SkeletonBox } from '@/components/skeletons/Skeleton'

export function RoomCardSkeleton() {
  return (
    <View className="flex-row items-center p-4 mb-2 bg-surface dark:bg-surface-dark rounded-xl">
      <SkeletonBox width={32} height={32} rounded="sm" />
      <View className="flex-1 ml-3">
        <SkeletonBox width="50%" height={16} rounded="sm" />
        <View className="flex-row items-center gap-2 mt-1.5">
          <SkeletonBox width={70} height={14} rounded="sm" />
          <SkeletonBox width={90} height={14} rounded="sm" />
        </View>
      </View>
      <SkeletonBox width={20} height={20} rounded="sm" />
    </View>
  )
}
