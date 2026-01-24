import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Skeleton, SkeletonBox, SkeletonCircle } from './Skeleton'

function PlantCardSkeleton() {
  return (
    <View className="flex flex-col gap-3 p-3 bg-white rounded-xl shadow-soft">
      {/* Image Container */}
      <View className="relative w-full aspect-square rounded-lg overflow-hidden">
        <Skeleton className="w-full h-full" rounded="lg" />
        {/* Health indicator dot placeholder */}
        <View className="absolute top-2 right-2 z-10">
          <SkeletonCircle size={12} />
        </View>
      </View>

      {/* Content */}
      <View className="gap-1">
        <SkeletonBox width="85%" height={18} rounded="sm" />
        <SkeletonBox width="60%" height={14} rounded="sm" />
        <View className="flex-row items-center gap-1.5 mt-1">
          <SkeletonCircle size={16} />
          <SkeletonBox width={50} height={12} rounded="sm" />
        </View>
      </View>
    </View>
  )
}

export function PlantsScreenSkeleton() {
  return (
    <View testID="plants-screen-skeleton">
      <SafeAreaView
        edges={['top', 'left', 'right']}
        className="flex-1 bg-[#f7f7f6]"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3">
          <SkeletonBox width={100} height={28} rounded="sm" />
          <View className="flex-row items-center gap-2">
            <SkeletonCircle size={32} />
            <SkeletonCircle size={32} />
            <SkeletonBox width={80} height={32} rounded="full" />
          </View>
        </View>

        {/* Filter Chips */}
        <View className="px-4 pb-3">
          <View className="flex-row gap-2">
            {[80, 60, 70, 90].map((width) => (
              <SkeletonBox
                key={`filter-${width}`}
                width={width}
                height={32}
                rounded="full"
              />
            ))}
          </View>
        </View>

        {/* Plant Grid */}
        <View className="flex-1 px-4">
          <View className="flex-row flex-wrap justify-between">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <View key={i} className="w-[48%] mb-4">
                <PlantCardSkeleton />
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}
