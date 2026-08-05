import { View } from 'react-native'
import { SkeletonBox } from '@/components/skeletons'

export function VacationModeSkeleton() {
  return (
    <View className="px-6 py-4 gap-4">
      {/* Intro text */}
      <SkeletonBox width="100%" height={14} rounded="sm" />
      <SkeletonBox width="85%" height={14} rounded="sm" />

      {/* Date summary row */}
      <View className="flex-row gap-3 mt-2">
        <SkeletonBox width="48%" height={64} rounded="xl" />
        <SkeletonBox width="48%" height={64} rounded="xl" />
      </View>

      {/* Calendar block */}
      <SkeletonBox width="100%" height={350} rounded="xl" />

      {/* Primary button */}
      <SkeletonBox width="100%" height={52} rounded="xl" />
    </View>
  )
}
