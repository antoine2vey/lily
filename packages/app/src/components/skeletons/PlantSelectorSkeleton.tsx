import { Array } from 'effect'
import { View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons/Skeleton'

export function PlantSelectorSkeleton() {
  return (
    <View className="gap-2">
      <SkeletonBox width="30%" height={14} rounded="sm" />
      <View className="gap-2 mt-2">
        {Array.map([1, 2, 3], (i) => (
          <View
            key={i}
            className="flex-row items-center p-3 rounded-xl bg-surface dark:bg-surface-dark"
          >
            <SkeletonCircle size={36} />
            <View className="flex-1 ml-3">
              <SkeletonBox width="50%" height={14} rounded="sm" />
            </View>
            <SkeletonBox width={24} height={24} rounded="sm" />
          </View>
        ))}
      </View>
    </View>
  )
}
