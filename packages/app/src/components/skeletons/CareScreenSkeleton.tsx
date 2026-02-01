import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SkeletonBox, SkeletonCircle } from './Skeleton'

function CareTaskCardSkeleton({ compact = false }: { compact?: boolean }) {
  const imageSize = compact ? 40 : 48

  return (
    <View className="flex-row items-center p-3 rounded-xl mb-2 bg-surface dark:bg-surface-dark">
      <SkeletonCircle size={imageSize} />
      <View className="flex-1 ml-3 gap-1">
        <SkeletonBox width="60%" height={compact ? 14 : 16} rounded="sm" />
        <SkeletonBox width={70} height={20} rounded="full" />
      </View>
      <SkeletonCircle size={28} />
    </View>
  )
}

function SectionSkeleton({ itemCount = 2 }: { itemCount?: number }) {
  return (
    <View className="mb-6">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          <SkeletonBox width={80} height={18} rounded="sm" />
          <SkeletonBox width={24} height={20} rounded="full" />
        </View>
      </View>
      {Array.from({ length: itemCount }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton items never reorder
        <CareTaskCardSkeleton key={i} />
      ))}
    </View>
  )
}

export function CareScreenSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
      <View className="flex-1 px-4">
        {/* Header */}
        <View className="flex-row items-center justify-between py-4">
          <View className="gap-1">
            <SkeletonBox width={100} height={12} rounded="sm" />
            <SkeletonBox width={60} height={28} rounded="sm" />
          </View>
          <SkeletonCircle size={40} />
        </View>

        {/* Overdue Section */}
        <SectionSkeleton itemCount={2} />

        {/* Today Section */}
        <SectionSkeleton itemCount={3} />

        {/* This Week Section */}
        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-3">
            <SkeletonBox width={80} height={18} rounded="sm" />
          </View>
          {/* Day group */}
          <View className="mb-4">
            <SkeletonBox width={70} height={14} rounded="sm" className="mb-2" />
            <CareTaskCardSkeleton compact />
            <CareTaskCardSkeleton compact />
          </View>
          {/* Another day group */}
          <View className="mb-4">
            <SkeletonBox width={80} height={14} rounded="sm" className="mb-2" />
            <CareTaskCardSkeleton compact />
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}
