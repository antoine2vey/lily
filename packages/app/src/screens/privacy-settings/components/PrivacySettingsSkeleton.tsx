import { Array } from 'effect'
import { View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'

function ToggleRowSkeleton() {
  return (
    <View className="flex-row items-center p-4">
      <View className="mr-3">
        <SkeletonBox width={40} height={40} rounded="xl" />
      </View>
      <View className="flex-1">
        <SkeletonBox width="55%" height={16} rounded="sm" />
        <View className="mt-0.5">
          <SkeletonBox width="80%" height={12} rounded="sm" />
        </View>
      </View>
      <SkeletonBox width={51} height={31} rounded="full" />
    </View>
  )
}

function ListRowSkeleton() {
  return (
    <View className="flex-row items-center min-h-[56px] py-2">
      <View className="mr-3">
        <SkeletonCircle size={40} />
      </View>
      <View className="flex-1">
        <SkeletonBox width="50%" height={16} rounded="sm" />
      </View>
      <SkeletonBox width={20} height={20} rounded="sm" />
    </View>
  )
}

export function PrivacySettingsSkeleton() {
  return (
    <View>
      {/* Description */}
      <View className="px-6 py-4">
        <SkeletonBox width="90%" height={14} rounded="sm" />
      </View>

      {/* Visibility & Personalization Section — 3 ToggleRows */}
      <View className="px-6 py-4">
        <SkeletonBox width="60%" height={20} rounded="sm" />
        <View className="mt-3">
          {Array.map([0, 1, 2], (i) => (
            <ToggleRowSkeleton key={i} />
          ))}
        </View>
      </View>

      {/* Weather & Location Section — 1 ToggleRow */}
      <View className="px-6 py-4 border-t border-border dark:border-slate-700">
        <SkeletonBox width="50%" height={20} rounded="sm" />
        <View className="mt-3">
          <ToggleRowSkeleton />
        </View>
      </View>

      {/* Legal & Info Section — 2 ListRows */}
      <View className="px-6 py-4 border-t border-border dark:border-slate-700">
        <SkeletonBox width="40%" height={20} rounded="sm" />
        <View className="mt-3">
          {Array.map([0, 1], (i) => (
            <ListRowSkeleton key={i} />
          ))}
        </View>
      </View>

      {/* Data Actions Section — Button + text Pressable */}
      <View className="px-6 py-4 border-t border-border dark:border-slate-700">
        <SkeletonBox width="45%" height={20} rounded="sm" />
        <View className="mt-4 gap-4">
          <SkeletonBox width="100%" height={56} rounded="xl" />
          <View className="py-3 items-center">
            <SkeletonBox width="45%" height={16} rounded="sm" />
          </View>
        </View>
      </View>
    </View>
  )
}
