import { View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from 'src/components/skeletons'

export function DelegationDetailSkeleton() {
  return (
    <View className="px-6 gap-6 mt-4">
      {/* Status badge */}
      <SkeletonBox width={80} height={28} rounded="full" />

      {/* People section */}
      <View className="gap-4">
        <View className="flex-row items-center p-4 rounded-xl bg-surface dark:bg-surface-dark">
          <SkeletonCircle size={48} />
          <View className="flex-1 ml-3">
            <SkeletonBox width="30%" height={12} rounded="sm" />
            <View className="mt-1">
              <SkeletonBox width="50%" height={16} rounded="sm" />
            </View>
          </View>
        </View>
        <View className="flex-row items-center p-4 rounded-xl bg-surface dark:bg-surface-dark">
          <SkeletonCircle size={48} />
          <View className="flex-1 ml-3">
            <SkeletonBox width="30%" height={12} rounded="sm" />
            <View className="mt-1">
              <SkeletonBox width="50%" height={16} rounded="sm" />
            </View>
          </View>
        </View>
      </View>

      {/* Date range */}
      <View className="flex-row gap-3">
        <View className="flex-1 p-4 rounded-xl bg-surface dark:bg-surface-dark">
          <SkeletonBox width="40%" height={10} rounded="sm" />
          <View className="mt-2">
            <SkeletonBox width="70%" height={16} rounded="sm" />
          </View>
        </View>
        <View className="flex-1 p-4 rounded-xl bg-surface dark:bg-surface-dark">
          <SkeletonBox width="40%" height={10} rounded="sm" />
          <View className="mt-2">
            <SkeletonBox width="70%" height={16} rounded="sm" />
          </View>
        </View>
      </View>

      {/* Message */}
      <View className="p-4 rounded-xl bg-surface dark:bg-surface-dark">
        <SkeletonBox width="30%" height={12} rounded="sm" />
        <View className="mt-2">
          <SkeletonBox width="90%" height={14} rounded="sm" />
        </View>
        <View className="mt-1">
          <SkeletonBox width="60%" height={14} rounded="sm" />
        </View>
      </View>

      {/* Plants list */}
      <View className="gap-2">
        <SkeletonBox width="25%" height={14} rounded="sm" />
        <View className="flex-row items-center p-3 rounded-xl bg-surface dark:bg-surface-dark">
          <SkeletonCircle size={32} />
          <View className="flex-1 ml-3">
            <SkeletonBox width="50%" height={14} rounded="sm" />
          </View>
        </View>
        <View className="flex-row items-center p-3 rounded-xl bg-surface dark:bg-surface-dark">
          <SkeletonCircle size={32} />
          <View className="flex-1 ml-3">
            <SkeletonBox width="40%" height={14} rounded="sm" />
          </View>
        </View>
      </View>
    </View>
  )
}
