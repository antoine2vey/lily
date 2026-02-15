import { View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from 'src/components/skeletons'

function UserCardSkeleton() {
  return (
    <View className="flex-row items-center px-4 py-3">
      <SkeletonCircle size={40} />
      <View className="flex-1 ml-3">
        <SkeletonBox width="50%" height={16} rounded="sm" />
        <View className="mt-1">
          <SkeletonBox width={80} height={14} rounded="sm" />
        </View>
      </View>
      <SkeletonBox width={80} height={32} rounded="xl" />
    </View>
  )
}

export function UserSearchSkeleton() {
  return (
    <View className="pt-2">
      <UserCardSkeleton />
      <UserCardSkeleton />
      <UserCardSkeleton />
      <UserCardSkeleton />
      <UserCardSkeleton />
    </View>
  )
}
