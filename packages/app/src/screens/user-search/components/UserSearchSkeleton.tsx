import { View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'

function UserCardSkeleton() {
  return (
    <View className="flex-row items-center px-4 py-3">
      <View className="w-10 h-10 rounded-full bg-surface-tinted dark:bg-slate-700 items-center justify-center overflow-hidden">
        <SkeletonCircle size={40} />
      </View>
      <View className="flex-1 ml-3">
        <SkeletonBox width="50%" height={16} rounded="sm" />
        <View className="mt-1">
          <SkeletonBox width={70} height={14} rounded="sm" />
        </View>
      </View>
      <SkeletonBox width={58} height={32} rounded="xl" />
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
