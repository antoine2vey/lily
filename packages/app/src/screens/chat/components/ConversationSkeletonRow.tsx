import { View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'

export const ConversationSkeletonRow = () => (
  <View className="flex-row items-center p-4 bg-surface dark:bg-surface-dark rounded-xl mb-2">
    <SkeletonCircle size={40} />
    <View className="flex-1 ml-3">
      <SkeletonBox width="60%" height={18} rounded="sm" />
      <View className="mt-0.5">
        <SkeletonBox width={90} height={14} rounded="sm" />
      </View>
    </View>
    <SkeletonBox width={20} height={20} rounded="sm" />
  </View>
)
