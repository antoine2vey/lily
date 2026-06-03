import { View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'

export function DelegationDetailSkeleton() {
  return (
    <View className="px-6 gap-6 mt-2">
      {/* Status badge — real: self-start px-3 py-1.5 rounded-full, text-xs */}
      <View className="self-start">
        <SkeletonBox width={80} height={26} rounded="full" />
      </View>

      {/* People section — real: gap-3, owner card / down arrow / caretaker card */}
      <View className="gap-3">
        {/* Owner — Avatar size="lg" = 56px */}
        <View className="flex-row items-center p-4 rounded-xl bg-surface dark:bg-surface-dark">
          <SkeletonCircle size={56} />
          <View className="flex-1 ml-3">
            <SkeletonBox width="30%" height={10} rounded="sm" />
            <View className="mt-1">
              <SkeletonBox width="55%" height={16} rounded="sm" />
            </View>
          </View>
        </View>

        {/* Arrow divider — real: centered arrow-downward 20px */}
        <View className="items-center">
          <SkeletonCircle size={20} />
        </View>

        {/* Caretaker — Avatar size="lg" = 56px */}
        <View className="flex-row items-center p-4 rounded-xl bg-surface dark:bg-surface-dark">
          <SkeletonCircle size={56} />
          <View className="flex-1 ml-3">
            <SkeletonBox width="30%" height={10} rounded="sm" />
            <View className="mt-1">
              <SkeletonBox width="55%" height={16} rounded="sm" />
            </View>
          </View>
        </View>
      </View>

      {/* Date range — real: two-column, label text-[10px], value text-sm mt-1 */}
      <View className="flex-row gap-3">
        <View className="flex-1 p-4 rounded-xl bg-surface dark:bg-surface-dark">
          <SkeletonBox width="40%" height={10} rounded="sm" />
          <View className="mt-1">
            <SkeletonBox width="70%" height={14} rounded="sm" />
          </View>
        </View>
        <View className="flex-1 p-4 rounded-xl bg-surface dark:bg-surface-dark">
          <SkeletonBox width="40%" height={10} rounded="sm" />
          <View className="mt-1">
            <SkeletonBox width="70%" height={14} rounded="sm" />
          </View>
        </View>
      </View>

      {/* Message — omitted: real card only renders when delegation.message is set (optional) */}

      {/* Plant list — real: header text-sm ml-1, then gap-2 plant cards p-3.
          Representative common case: 2 plant cards (count is dynamic). */}
      <View className="gap-2">
        <View className="ml-1">
          <SkeletonBox width="40%" height={14} rounded="sm" />
        </View>
        <View className="flex-row items-center p-3 rounded-xl bg-surface dark:bg-surface-dark">
          {/* Avatar size="sm" = 32px */}
          <SkeletonCircle size={32} />
          <View className="flex-1 ml-3">
            <SkeletonBox width="50%" height={14} rounded="sm" />
            <View className="flex-row items-center mt-0.5">
              <SkeletonBox width="35%" height={12} rounded="sm" />
            </View>
          </View>
          {/* Trailing chevron-right (size 20) — circular placeholder */}
          <SkeletonCircle size={20} />
        </View>
        <View className="flex-row items-center p-3 rounded-xl bg-surface dark:bg-surface-dark">
          <SkeletonCircle size={32} />
          <View className="flex-1 ml-3">
            <SkeletonBox width="40%" height={14} rounded="sm" />
            <View className="flex-row items-center mt-0.5">
              <SkeletonBox width="30%" height={12} rounded="sm" />
            </View>
          </View>
          <SkeletonCircle size={20} />
        </View>
      </View>

      {/* Actions — real: gap-3 buttons, py-4 (16px) px-8 rounded-xl + text-base
          line (~24px) ≈ 56px tall. Representative common case: 2 buttons. */}
      <View className="gap-3">
        <SkeletonBox width="100%" height={56} rounded="xl" />
        <SkeletonBox width="100%" height={56} rounded="xl" />
      </View>
    </View>
  )
}
