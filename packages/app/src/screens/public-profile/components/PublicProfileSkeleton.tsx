import { Array } from 'effect'
import { useWindowDimensions, View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from 'src/components/skeletons'

export function PublicProfileSkeleton() {
  const { width } = useWindowDimensions()
  const padding = 16
  const gap = 8
  const columns = 3
  const cellSize = (width - padding * 2 - gap * (columns - 1)) / columns

  return (
    <View className="flex-1 items-center pt-8 px-4">
      <SkeletonCircle size={80} />
      <View className="mt-4 items-center">
        <SkeletonBox width={140} height={20} rounded="sm" />
        <View className="mt-2">
          <SkeletonBox width={100} height={14} rounded="sm" />
        </View>
      </View>

      <View className="mt-6 w-full flex-row justify-around mx-4 rounded-2xl p-4 bg-surface dark:bg-surface-dark">
        <View className="items-center gap-1">
          <SkeletonBox width={30} height={18} rounded="sm" />
          <SkeletonBox width={50} height={12} rounded="sm" />
        </View>
        <View className="items-center gap-1">
          <SkeletonBox width={30} height={18} rounded="sm" />
          <SkeletonBox width={60} height={12} rounded="sm" />
        </View>
        <View className="items-center gap-1">
          <SkeletonBox width={30} height={18} rounded="sm" />
          <SkeletonBox width={60} height={12} rounded="sm" />
        </View>
      </View>

      <View className="mt-6 w-full">
        <SkeletonBox width={80} height={12} rounded="sm" />
        <View className="mt-3 flex-row flex-wrap" style={{ gap }}>
          {Array.map(Array.range(0, 5), (i) => (
            <View key={i}>
              <SkeletonBox width={cellSize} height={cellSize} rounded="xl" />
            </View>
          ))}
        </View>
      </View>

      <View className="mt-6 w-full">
        <SkeletonBox width="100%" height={48} rounded="xl" />
      </View>
    </View>
  )
}
