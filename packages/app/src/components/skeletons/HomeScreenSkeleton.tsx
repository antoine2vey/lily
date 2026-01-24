import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SkeletonBox, SkeletonCircle } from './Skeleton'

export function HomeScreenSkeleton() {
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1 bg-background"
    >
      <View className="flex-1 px-4">
        {/* Header */}
        <View className="flex-row items-center justify-between py-4">
          <View className="gap-1">
            <SkeletonBox width={100} height={14} rounded="sm" />
            <SkeletonBox width={150} height={24} rounded="sm" />
          </View>
          <View className="flex-row items-center gap-3">
            <SkeletonCircle size={24} />
            <SkeletonCircle size={40} />
          </View>
        </View>

        {/* Hydration Card */}
        <View className="bg-surface rounded-2xl p-4 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between mb-3">
            <View className="gap-1 flex-1">
              <SkeletonBox width={120} height={18} rounded="sm" />
              <SkeletonBox width="80%" height={14} rounded="sm" />
            </View>
          </View>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              {[1, 2, 3].map((i) => (
                <SkeletonCircle key={i} size={36} />
              ))}
              <SkeletonBox width={36} height={36} rounded="full" />
            </View>
            <SkeletonBox width={100} height={40} rounded="xl" />
          </View>
        </View>

        {/* Stats Row */}
        <View className="flex-row gap-3 mb-6">
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              className="flex-1 bg-surface rounded-xl p-4 shadow-sm"
            >
              <SkeletonBox
                width={32}
                height={32}
                rounded="lg"
                className="mb-2"
              />
              <SkeletonBox
                width="60%"
                height={24}
                rounded="sm"
                className="mb-1"
              />
              <SkeletonBox width="80%" height={12} rounded="sm" />
            </View>
          ))}
        </View>

        {/* Recent Activity Section */}
        <View className="flex-row items-center justify-between mb-3">
          <SkeletonBox width={120} height={18} rounded="sm" />
          <SkeletonBox width={60} height={14} rounded="sm" />
        </View>

        {/* Activity Items */}
        <View className="gap-3">
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              className="flex-row items-center bg-surface rounded-xl p-3 shadow-sm"
            >
              <SkeletonCircle size={40} />
              <View className="flex-1 ml-3 gap-1">
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
