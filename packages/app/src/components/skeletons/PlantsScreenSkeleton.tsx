import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Skeleton, SkeletonBox, SkeletonCircle } from './Skeleton'

function PlantCardSkeleton() {
  return (
    <View className="flex flex-col gap-3 p-3 bg-white rounded-xl shadow-soft">
      {/* Image Container - matches PlantCard exactly */}
      <View className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-100">
        {/* Health indicator dot */}
        <View className="absolute top-2 right-2 z-10">
          <SkeletonCircle size={12} />
        </View>
        {/* Image placeholder */}
        <Skeleton className="w-full h-full" rounded="lg" />
      </View>

      {/* Content - matches PlantCard exactly */}
      <View>
        {/* Plant name */}
        <SkeletonBox width="80%" height={18} rounded="sm" className="mb-0.5" />
        {/* Water indicator row */}
        <View className="flex-row items-center gap-1.5">
          <SkeletonCircle size={16} />
          <SkeletonBox width={50} height={12} rounded="sm" />
        </View>
      </View>
    </View>
  )
}

export function PlantsScreenSkeleton() {
  return (
    <View testID="plants-screen-skeleton" className="flex-1">
      <SafeAreaView
        edges={['top', 'left', 'right']}
        className="flex-1 bg-[#f7f7f6]"
      >
        <View>
          {/* Header - matches PlantsScreen exactly: px-5 pt-12 pb-2 */}
          <View className="flex-row items-center justify-between px-5 pt-12 pb-1">
            {/* Title placeholder */}
            <SkeletonBox width={140} height={32} rounded="sm" />
            {/* Right buttons: search, sort, view toggle - gap-3 */}
            <View className="flex-row items-center gap-1">
              <SkeletonCircle size={40} />
              <SkeletonCircle size={40} />
              <SkeletonCircle size={40} />
            </View>
          </View>

          {/* Filter Chips - matches PlantFilters: px-5 py-3 gap-3 */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="w-full"
            contentContainerStyle={{
              flexDirection: 'row-reverse',
              gap: 12,
              paddingHorizontal: 17,
              paddingVertical: 12,
            }}
          >
            {/* 3 filter chips - height 40, rounded-full */}
            <SkeletonBox width={140} height={40} rounded="full" />
            <SkeletonBox width={100} height={40} rounded="full" />
            <SkeletonBox width={80} height={40} rounded="full" />
          </ScrollView>
        </View>

        {/* Plants Grid - matches FlatList: px-3 pt-2 */}
        <View className="flex-1 px-3 pt-2">
          <View className="flex-row flex-wrap">
            {/* 6 plant cards in 2-column grid with p-2 */}
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <View key={i} className="w-1/2 p-2">
                <PlantCardSkeleton />
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}
