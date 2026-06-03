import { Array } from 'effect'
import { useWindowDimensions, View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'

export function PublicProfileSkeleton() {
  const { width } = useWindowDimensions()
  const padding = 16
  const gap = 8
  const columns = 3
  const cellSize = (width - padding * 2 - gap * (columns - 1)) / columns

  return (
    <View className="flex-1">
      {/* Header: avatar + name + bio + member badge (mirrors pt-4 px-4 items-center) */}
      <View className="items-center pt-4 px-4">
        {/* Avatar: w-20 h-20 bordered container (border-2 + p-1), inner content ~68x68 */}
        <View className="w-20 h-20 rounded-full p-1 border-2 border-primary bg-surface dark:bg-surface-dark mb-3 items-center justify-center">
          <SkeletonCircle size={68} />
        </View>

        {/* Name (text-xl ~24px line height) */}
        <SkeletonBox width={140} height={24} rounded="sm" />

        {/* Bio (text-sm mt-1) */}
        <View className="mt-1">
          <SkeletonBox width={200} height={14} rounded="sm" />
        </View>

        {/* Member badge: mt-3 px-3 py-1 rounded-full bordered */}
        <View className="mt-3 px-3 py-1 bg-surface dark:bg-surface-dark border border-border/50 dark:border-slate-700/50 rounded-full">
          <SkeletonBox width={120} height={12} rounded="sm" />
        </View>
      </View>

      {/* Stats card: mt-6 wrapper, mx-4 rounded-2xl p-4 flex-row bordered.
          Real ProfileStats always renders exactly 3 columns (Plants,
          Followers, Following) with a right divider on all but the last. */}
      <View className="mt-6">
        <View className="mx-4 rounded-2xl p-4 flex-row bg-surface dark:bg-surface-dark border border-border/30 dark:border-slate-700/30 shadow-sm">
          {Array.map(
            Array.makeBy(3, (i) => i),
            (i) => (
              <View
                key={i}
                className={`flex-1 items-center gap-1 ${i < 2 ? 'border-r border-border/50 dark:border-slate-700/50' : ''}`}
              >
                <SkeletonBox width={30} height={18} rounded="sm" />
                <SkeletonBox width={50} height={12} rounded="sm" />
              </View>
            )
          )}
        </View>
      </View>

      {/* Plant grid: mt-6 wrapper, px-4 section, "Recent plants" title, 3-col grid */}
      <View className="mt-6">
        <View className="px-4">
          <SkeletonBox width={90} height={11} rounded="sm" />
          <View className="mt-3 flex-row flex-wrap" style={{ gap }}>
            {Array.map(Array.range(0, 5), (i) => (
              <View key={i} style={{ width: cellSize }}>
                <View
                  className="rounded-xl overflow-hidden bg-surface dark:bg-surface-dark border border-border/30 dark:border-slate-700/30"
                  style={{ width: cellSize, height: cellSize }}
                />
                <View className="mt-1.5 mb-1 items-center">
                  <SkeletonBox
                    width={cellSize * 0.7}
                    height={11}
                    rounded="sm"
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Action buttons: mt-6 px-4. Only the Follow button (py-4) is always
          present; the Nudge button renders solely when profile.isFollowing,
          so the representative loading case (not-yet-following) shows one
          button to avoid layout shift when Nudge is absent. */}
      <View className="mt-6 px-4">
        <SkeletonBox width="100%" height={56} rounded="xl" />
      </View>
    </View>
  )
}
