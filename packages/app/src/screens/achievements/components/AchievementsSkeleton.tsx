import { Array } from 'effect'
import { ScrollView, View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'

// Mirrors AchievementCard: Pressable (flex-1 p-4 rounded-2xl m-1) wrapping a
// centered column of icon circle (w-16 h-16, tinted bg), name (text-sm, 1
// line), description (text-xs, 2 lines), plus the always-present chrome:
// unlocked cards get a top-right checkmark badge; locked cards get a progress
// bar + progress text at mt-3.
function AchievementCardSkeleton({ unlocked }: { unlocked: boolean }) {
  return (
    <View className="w-1/2">
      <View
        className={`flex-1 p-4 rounded-2xl m-1 ${unlocked ? 'bg-surface dark:bg-surface-dark' : 'bg-background dark:bg-background-dark border border-border dark:border-slate-700'}`}
      >
        <View className="items-center">
          {/* Icon circle (64px) with tinted background */}
          <View
            className={`w-16 h-16 rounded-full items-center justify-center mb-3 ${unlocked ? 'bg-primary-tint dark:bg-surface-dark' : 'bg-surface-tinted dark:bg-surface-dark'}`}
          >
            <SkeletonCircle size={64} />
          </View>
          {/* Name (text-sm, 1 line) */}
          <SkeletonBox width={80} height={14} rounded="sm" />
          {/* Description (text-xs, 2 lines) */}
          <View className="items-center mt-1">
            <SkeletonBox width={110} height={12} rounded="sm" />
            <View className="mt-1">
              <SkeletonBox width={70} height={12} rounded="sm" />
            </View>
          </View>

          {/* Locked cards: progress bar (height 4) + progress text at mt-3 */}
          {!unlocked && (
            <View className="w-full mt-3">
              <SkeletonBox width="100%" height={4} rounded="full" />
              <View className="items-center mt-1">
                <SkeletonBox width={40} height={12} rounded="sm" />
              </View>
            </View>
          )}

          {/* Unlocked cards: top-right checkmark badge */}
          {unlocked && (
            <View className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary" />
          )}
        </View>
      </View>
    </View>
  )
}

// Mirrors a category section: SectionHeader (flex-row items-center
// justify-between, text-lg) + 2-column card grid. The representative grid
// alternates unlocked/locked cards to show both card variants.
function AchievementsSectionSkeleton({ cardCount }: { cardCount: number }) {
  return (
    <View className="px-4 py-4">
      {/* SectionHeader (flex-row items-center justify-between) */}
      <View className="flex-row items-center justify-between">
        <SkeletonBox width={120} height={20} rounded="sm" />
      </View>
      <View className="flex-row flex-wrap mt-2">
        {Array.map(Array.range(1, cardCount), (i) => (
          <AchievementCardSkeleton key={i} unlocked={i % 2 === 1} />
        ))}
      </View>
    </View>
  )
}

export function AchievementsSkeleton() {
  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
      {/* Level Header (mirrors the bg-surface, px-6 py-6, items-center section) */}
      <View className="px-6 py-6 items-center bg-surface dark:bg-surface-dark">
        {/* Gold icon circle (80px) */}
        <View className="w-20 h-20 rounded-full items-center justify-center mb-3 bg-achievement-gold">
          <SkeletonCircle size={80} />
        </View>
        {/* Level title (text-2xl) */}
        <SkeletonBox width={100} height={28} rounded="sm" />
        {/* Progress subtitle (text-sm, mt-1) */}
        <View className="mt-1">
          <SkeletonBox width={160} height={14} rounded="sm" />
        </View>
        {/* Progress bar (height 8, px-8 width, mt-4) */}
        <View className="w-full mt-4 px-8">
          <SkeletonBox width="100%" height={8} rounded="full" />
        </View>
      </View>

      {/* Category sections (header + 2-col card grid) */}
      {Array.map(
        [
          { id: 'section-1', cardCount: 4 },
          { id: 'section-2', cardCount: 4 },
          { id: 'section-3', cardCount: 2 },
        ],
        (section) => (
          <AchievementsSectionSkeleton
            key={section.id}
            cardCount={section.cardCount}
          />
        )
      )}
    </ScrollView>
  )
}
