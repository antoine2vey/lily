import { Array as Arr } from 'effect'
import { View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'

function DelegationCardSkeleton() {
  return (
    <View className="p-4 rounded-xl bg-surface dark:bg-surface-dark">
      {/* Status badge */}
      <SkeletonBox width={70} height={24} rounded="full" />

      {/* Person info */}
      <View className="flex-row items-center mt-3">
        <SkeletonCircle size={40} />
        <View className="flex-1 ml-3">
          <SkeletonBox width="25%" height={10} rounded="sm" />
          <View className="mt-1">
            <SkeletonBox width="50%" height={14} rounded="sm" />
          </View>
        </View>
      </View>

      {/* Date and plant count */}
      <View className="flex-row items-center mt-3 gap-4">
        <SkeletonBox width={120} height={12} rounded="sm" />
        <SkeletonBox width={60} height={12} rounded="sm" />
      </View>
    </View>
  )
}

export function DelegationListSkeleton() {
  return (
    <View className="gap-3 px-6">
      {Arr.map([1, 2, 3], (i) => (
        <DelegationCardSkeleton key={i} />
      ))}
    </View>
  )
}
