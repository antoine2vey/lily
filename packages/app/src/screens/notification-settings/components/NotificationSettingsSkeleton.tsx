import { Array } from 'effect'
import { View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { SkeletonBox } from '@/components/skeletons'

// Mirrors a single ToggleRow: flex-row items-center p-4, icon box
// (w-10 h-10 rounded-xl bg-primary-tint), flex-1 text column (label +
// description), and a switch-shaped placeholder on the right.
function ToggleRowSkeleton({ showBorder = false }: { showBorder?: boolean }) {
  return (
    <View
      className={`flex-row items-center p-4 ${
        showBorder ? 'border-b border-border/50 dark:border-slate-700/50' : ''
      }`}
    >
      <View className="w-10 h-10 rounded-xl items-center justify-center mr-3 bg-primary-tint dark:bg-primary/20">
        <SkeletonBox width={22} height={22} rounded="sm" />
      </View>
      <View className="flex-1">
        <SkeletonBox width="55%" height={16} rounded="sm" />
        <View className="mt-0.5">
          <SkeletonBox width="80%" height={12} rounded="sm" />
        </View>
      </View>
      {/* Switch placeholder — matches native RN Switch (~51×31 on iOS) */}
      <View
        className="rounded-full bg-border/40 dark:bg-slate-700/50"
        style={{ width: 51, height: 31 }}
      />
    </View>
  )
}

// Mirrors a section: all-caps title (text-xs) + card container with the
// exact chrome (bg-surface rounded-2xl shadow-sm border).
function SectionSkeleton({
  titleWidth,
  children,
}: {
  titleWidth: number
  children: React.ReactNode
}) {
  return (
    <View className="mb-6">
      <View className="mb-2 ml-3">
        <SkeletonBox width={titleWidth} height={12} rounded="sm" />
      </View>
      <View className="bg-surface dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-border/30 dark:border-slate-700/30">
        {children}
      </View>
    </View>
  )
}

export function NotificationSettingsSkeleton() {
  return (
    <Animated.View entering={FadeIn.duration(300)} className="flex-1">
      {/* Header: matches flex-row items-center px-4 py-3 with back button +
          centered title */}
      <View className="flex-row items-center px-4 py-3">
        <View className="w-10 h-10 rounded-full bg-border/40 dark:bg-slate-700/50" />
        <View className="flex-1 items-center mr-10">
          <SkeletonBox width={160} height={20} rounded="sm" />
        </View>
      </View>

      {/* Content: matches ScrollView className="px-4" with
          contentContainerStyle paddingTop 24 */}
      <View className="px-4" style={{ paddingTop: 24 }}>
        {/* Care Reminders: 1 ToggleRow (showBorder) + time-picker block */}
        <SectionSkeleton titleWidth={120}>
          <ToggleRowSkeleton showBorder />
          <View className="p-4 bg-surface-tinted/50 dark:bg-slate-800/50">
            <View className="mb-2 ml-1">
              <SkeletonBox width={90} height={12} rounded="sm" />
            </View>
            <View className="flex-row items-center bg-surface dark:bg-surface-dark border border-border/50 dark:border-slate-700/50 rounded-xl py-3 px-4">
              <View className="flex-1">
                <SkeletonBox width={80} height={16} rounded="sm" />
              </View>
              <SkeletonBox width={20} height={20} rounded="sm" />
            </View>
          </View>
        </SectionSkeleton>

        {/* Updates & Alerts: 4 ToggleRows (first 3 with border) */}
        <SectionSkeleton titleWidth={130}>
          {Array.map([0, 1, 2, 3], (i) => (
            <ToggleRowSkeleton key={i} showBorder={i < 3} />
          ))}
        </SectionSkeleton>

        {/* Do Not Disturb: 1 ToggleRow (collapsed, no border) */}
        <SectionSkeleton titleWidth={110}>
          <ToggleRowSkeleton />
        </SectionSkeleton>

        {/* Timezone: 2 Pressable rows (icon box + text + chevron) */}
        <SectionSkeleton titleWidth={80}>
          <View className="flex-row items-center gap-3 p-4 border-b border-border/50 dark:border-slate-700/50">
            <View className="w-10 h-10 rounded-xl items-center justify-center bg-primary-tint dark:bg-primary/20">
              <SkeletonBox width={22} height={22} rounded="sm" />
            </View>
            <View className="flex-1">
              <SkeletonBox width="45%" height={16} rounded="sm" />
              <View className="mt-1">
                <SkeletonBox width="65%" height={12} rounded="sm" />
              </View>
            </View>
            <SkeletonBox width={20} height={20} rounded="sm" />
          </View>
          <View className="flex-row items-center gap-3 p-4">
            <View className="w-10 h-10 rounded-xl items-center justify-center bg-primary-tint dark:bg-primary/20">
              <SkeletonBox width={22} height={22} rounded="sm" />
            </View>
            <View className="flex-1">
              <SkeletonBox width="50%" height={16} rounded="sm" />
            </View>
          </View>
        </SectionSkeleton>
      </View>
    </Animated.View>
  )
}
