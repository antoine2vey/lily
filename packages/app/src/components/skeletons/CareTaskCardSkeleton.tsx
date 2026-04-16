import { View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons/Skeleton'

interface CareTaskCardSkeletonProps {
  compact?: boolean
}

export function CareTaskCardSkeleton({
  compact = false,
}: CareTaskCardSkeletonProps) {
  const imageSize = compact ? 40 : 48

  return (
    <View className="flex-row items-center p-3 rounded-xl mb-2 bg-surface dark:bg-surface-dark">
      <SkeletonCircle size={imageSize} />
      <View className="flex-1 ml-3">
        <SkeletonBox width="60%" height={compact ? 14 : 16} rounded="sm" />
        <View className="mt-1">
          <SkeletonBox width={70} height={20} rounded="full" />
        </View>
      </View>
      <View className="w-10 h-10 items-center justify-center">
        <SkeletonCircle size={28} />
      </View>
    </View>
  )
}
