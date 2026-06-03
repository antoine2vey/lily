import { Array } from 'effect'
import { LinearGradient } from 'expo-linear-gradient'
import { View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'
import { useIconColors } from '@/hooks/useIconColors'

export function HomeContentSkeleton() {
  const { isDark } = useIconColors()

  // Mirror HydrationCard's theme-specific gradient stops so the skeleton fades
  // into the real card without a color flash.
  const hydrationGradient: [string, string, string] = isDark
    ? ['#1E2A1A', '#243320', '#2D3728']
    : ['#dceccb', '#eaf6df', '#ffffff']

  return (
    <>
      {/* Today Section — mirrors TodaySection: label, done/meta row, progress bar */}
      <View className="mb-6">
        <View className="mb-2">
          <SkeletonBox width={50} height={11} rounded="sm" />
        </View>
        <View className="flex-row items-end justify-between mb-2.5">
          <SkeletonBox width={110} height={16} rounded="sm" />
          <SkeletonBox width={120} height={12} rounded="sm" />
        </View>
        <SkeletonBox width="100%" height={8} rounded="full" />
      </View>

      {/* HydrationCard — LinearGradient rounded-[32px] p-6: header + plant circles + button */}
      <LinearGradient
        colors={hydrationGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 32,
          padding: 24,
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: isDark ? 0.3 : 0.06,
          shadowRadius: 20,
          elevation: 4,
          marginBottom: 16,
        }}
      >
        <View className="flex-row items-start justify-between mb-6">
          <View className="gap-1.5">
            <SkeletonBox width={140} height={20} rounded="sm" />
            <SkeletonBox width={180} height={14} rounded="sm" />
          </View>
          <SkeletonCircle size={40} />
        </View>
        <View className="flex-row gap-5 mb-7">
          {Array.map([1, 2, 3], (i) => (
            <View key={i} className="items-center gap-2">
              <SkeletonCircle size={72} />
              <SkeletonBox width={48} height={12} rounded="sm" />
            </View>
          ))}
        </View>
        <SkeletonBox width="100%" height={48} rounded="full" />
      </LinearGradient>

      {/* NeedsAttentionRow omitted — real NeedsAttentionRow returns null when
          count === 0 (the common case for a healthy collection), so rendering
          it here would cause a layout shift on swap. */}

      {/* WeeklySchedule — icon+label row, then 7 day columns width 48 */}
      <View className="mb-8">
        <View className="flex-row items-center gap-2 mb-3 px-1">
          <SkeletonBox width={16} height={16} rounded="sm" />
          <SkeletonBox width={120} height={16} rounded="sm" />
        </View>
        <View className="flex-row gap-2 px-0.5">
          {Array.map([1, 2, 3, 4, 5, 6, 7], (i) => (
            <View
              key={i}
              className="items-center py-3 rounded-2xl"
              style={{ width: 48, backgroundColor: 'rgba(0,0,0,0.04)' }}
            >
              <View className="mb-1">
                <SkeletonBox width={24} height={10} rounded="sm" />
              </View>
              <View className="mb-2">
                <SkeletonBox width={16} height={16} rounded="sm" />
              </View>
              <SkeletonBox width={6} height={6} rounded="full" />
            </View>
          ))}
        </View>
      </View>

      {/* AchievementTeaser — header + bg-surface rounded-[20px] p-4, up to 2 rows */}
      <View className="mb-8">
        <View className="flex-row items-center justify-between mb-3 px-1">
          <SkeletonBox width={140} height={16} rounded="sm" />
          <SkeletonBox width={50} height={14} rounded="sm" />
        </View>
        <View
          className="bg-surface dark:bg-surface-dark rounded-[20px] p-4 gap-4"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.2 : 0.06,
            shadowRadius: 8,
            elevation: 2,
          }}
        >
          {Array.map([1, 2], (i) => (
            <View key={i} className="gap-2">
              <View className="flex-row items-center gap-3">
                <SkeletonCircle size={36} />
                <View className="flex-1 gap-1">
                  <SkeletonBox width="55%" height={14} rounded="sm" />
                  <SkeletonBox width="35%" height={12} rounded="sm" />
                </View>
                <SkeletonBox width={32} height={12} rounded="sm" />
              </View>
              <SkeletonBox width="100%" height={6} rounded="full" />
            </View>
          ))}
        </View>
      </View>

      {/* RecentActivity — header + 3 rows, each bg-white rounded-[20px] p-4 */}
      <View className="flex-row items-center justify-between mb-4 px-1">
        <SkeletonBox width={120} height={20} rounded="sm" />
        <SkeletonBox width={50} height={14} rounded="sm" />
      </View>
      <View className="gap-3">
        {Array.map([1, 2, 3], (i) => (
          <View
            key={i}
            className="flex-row items-center bg-white dark:bg-surface-dark rounded-[20px] p-4 gap-4"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.03,
              shadowRadius: 2,
              elevation: 1,
            }}
          >
            <SkeletonCircle size={48} />
            <View className="flex-1 gap-1.5">
              <SkeletonBox width="70%" height={14} rounded="sm" />
              <SkeletonBox width="40%" height={12} rounded="sm" />
            </View>
          </View>
        ))}
      </View>
    </>
  )
}
