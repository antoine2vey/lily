import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SkeletonBox, SkeletonCircle } from './Skeleton'

export function HomeScreenSkeleton() {
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1 bg-background"
    >
      <View className="flex-1 px-4 pt-6">
        {/* Header */}
        <View className="flex-row items-center justify-between pt-1">
          <View className="gap-0.5">
            <SkeletonBox width={160} height={23} rounded="sm" />
            <SkeletonBox width={100} height={23} rounded="sm" />
          </View>
          <View className="flex-row items-center gap-3">
            <SkeletonCircle size={40} />
            <SkeletonCircle size={40} />
          </View>
        </View>

        {/* Hydration Card */}
        <View className="bg-surface rounded-2xl p-6 mb-4 shadow-sm mt-4">
          <View className="flex-row items-center justify-between mb-3 mt-2">
            <View className="gap-1 flex-1">
              <SkeletonBox width={120} height={18} rounded="sm" />
              <SkeletonBox width="50%" height={14} rounded="sm" />
            </View>
          </View>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-6 mt-5">
              {[1, 2, 3].map((i) => (
                <SkeletonCircle
                  key={i}
                  size={70}
                  className="w-[72px] h-[72px]"
                />
              ))}
            </View>
          </View>
          <SkeletonBox
            width="100%"
            height={45}
            rounded="full"
            className="mt-12"
          />
        </View>

        {/* Stats Row */}
        <View className="flex-row gap-3 mb-5">
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              className="flex-1 bg-surface rounded-xl p-4 shadow-sm items-center"
            >
              <SkeletonBox
                width={32}
                height={32}
                rounded="lg"
                className="mb-0.5"
              />
              <SkeletonBox width="80%" height={12} rounded="sm" />
            </View>
          ))}
        </View>

        {/* Recent Activity Section */}
        <View className="flex-row items-center justify-between mb-3">
          <SkeletonBox width={120} height={22} rounded="sm" />
          <SkeletonBox width={50} height={16} rounded="sm" />
        </View>

        {/* Activity Items */}
        <View className="gap-2">
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              className="flex-row items-center bg-white rounded-[20px] p-4 mb-2"
            >
              <SkeletonCircle size={40} />
              <View className="flex-1 ml-3 gap-2">
                <SkeletonBox width="70%" height={14} rounded="sm" />
                <SkeletonBox width="50%" height={12} rounded="sm" />
              </View>
              <SkeletonBox width={60} height={12} rounded="sm" />
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  )
}
