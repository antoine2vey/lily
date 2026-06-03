import { Array, pipe } from 'effect'
import { ScrollView, View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'

function UsageMeterSkeleton() {
  return (
    <View className="gap-2">
      <View className="flex-row items-end justify-between">
        <View className="flex-row items-center gap-2">
          <SkeletonCircle size={18} />
          <SkeletonBox width={90} height={14} rounded="sm" />
        </View>
        <SkeletonBox width={40} height={14} rounded="sm" />
      </View>
      <View className="h-2.5 rounded-full overflow-hidden bg-surface-tinted dark:bg-slate-700">
        <SkeletonBox width="55%" height="100%" rounded="full" />
      </View>
    </View>
  )
}

export function SubscriptionUsageSkeleton() {
  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: 8 }}
    >
      {/* Current Plan Card (mirrors PlanCard) */}
      <View className="mt-2">
        <View className="mx-4 rounded-2xl p-6 shadow-sm border border-border/30 dark:border-slate-700/30 bg-surface dark:bg-surface-dark">
          {/* Header row: plan name + status badge */}
          <View className="flex-row items-start justify-between mb-6">
            <View className="gap-1">
              <SkeletonBox width={90} height={12} rounded="sm" />
              <SkeletonBox width={150} height={36} rounded="md" />
            </View>
            <SkeletonBox width={76} height={24} rounded="full" />
          </View>
          {/* 3 usage meters */}
          <View className="gap-5">
            {pipe(
              Array.range(0, 2),
              Array.map((i) => <UsageMeterSkeleton key={i} />)
            )}
          </View>
        </View>
      </View>

      {/* Premium Upgrade Card (mirrors non-premium upgrade card) */}
      <View className="mx-4 mt-6 rounded-2xl p-6 items-center shadow-lg border border-primary/20 bg-surface dark:bg-surface-dark overflow-hidden">
        {/* Star Icon */}
        <View className="mb-4">
          <SkeletonCircle size={56} />
        </View>
        {/* Premium Access Label */}
        <View className="mb-1">
          <SkeletonBox width={120} height={14} rounded="sm" />
        </View>
        {/* Title */}
        <View className="mb-4">
          <SkeletonBox width={180} height={28} rounded="md" />
        </View>
        {/* Feature List */}
        <View className="w-full rounded-xl p-4 mb-4 gap-3 bg-background dark:bg-background-dark border border-border/30 dark:border-slate-700/30">
          {pipe(
            Array.range(0, 2),
            Array.map((i) => (
              <View key={i} className="flex-row items-start gap-3">
                <SkeletonCircle size={20} />
                <SkeletonBox width="70%" height={14} rounded="sm" />
              </View>
            ))
          )}
        </View>
        {/* View Plans Button */}
        <SkeletonBox width="100%" height={52} rounded="xl" />
      </View>

      {/* Restore Purchases */}
      <View className="items-center py-6">
        <SkeletonBox width={130} height={14} rounded="sm" />
      </View>
    </ScrollView>
  )
}
