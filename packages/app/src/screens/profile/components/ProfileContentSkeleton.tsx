import { Array, Option, pipe } from 'effect'
import { ScrollView, View } from 'react-native'
import { Skeleton, SkeletonBox, SkeletonCircle } from '@/components/skeletons'

// Menu items mirror the 9 ProfileMenuItem cards in ProfileScreen. Items 3
// (Delegations) and 4 (Subscription) can render a trailing Badge before the
// 24px chevron, so we reserve a representative badge-width placeholder for
// those rows to avoid the chevron left-shifting when the badge appears.
const MENU_ITEMS = [
  { id: 1 },
  { id: 2 },
  { id: 3, badgeWidth: 24 },
  { id: 4, badgeWidth: 62 },
  { id: 5 },
  { id: 6 },
  { id: 7 },
  { id: 8 },
  { id: 9 },
]

export function ProfileContentSkeleton() {
  return (
    <ScrollView className="flex-1 px-0" showsVerticalScrollIndicator={false}>
      {/* Profile Header — mirrors ProfileHeader (items-center pt-2 pb-4) */}
      <View className="items-center pt-2 pb-4">
        {/* Avatar: w-20 h-20 rounded-full p-1 border-2 border-primary mb-3.
            Inner fills the inset box (w-full h-full) exactly like the real
            ProfileHeader avatar, so it stays centered within the green ring. */}
        <View className="w-20 h-20 rounded-full p-1 border-2 border-primary bg-surface dark:bg-surface-dark mb-3">
          <Skeleton width="100%" height="100%" rounded="full" />
        </View>

        {/* Name: text-xl font-bold (24px line height) */}
        <SkeletonBox width={140} height={24} rounded="sm" />

        {/* Username: text-sm font-medium (14px) */}
        <View className="mt-1">
          <SkeletonBox width={100} height={14} rounded="sm" />
        </View>

        {/* Member-since pill: mt-3 px-3 py-1 rounded-full border */}
        <View className="mt-3 px-3 py-1 bg-surface dark:bg-surface-dark border border-border/50 dark:border-slate-700/50 rounded-full">
          <SkeletonBox width={120} height={12} rounded="sm" />
        </View>

        {/* Follower / following stat blocks: flex-row justify-center gap-8 mt-4 */}
        <View className="flex-row justify-center gap-8 mt-4">
          {Array.map([1, 2], (i) => (
            <View key={i} className="items-center">
              {/* count: text-lg (20px) */}
              <SkeletonBox width={32} height={20} rounded="sm" />
              {/* label: text-xs (12px) */}
              <View className="mt-1">
                <SkeletonBox width={56} height={12} rounded="sm" />
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Stats Card — mirrors StatsCard container exactly */}
      <View className="mx-4 rounded-2xl p-4 flex-row bg-surface dark:bg-surface-dark border border-border/30 dark:border-slate-700/30 shadow-sm">
        {Array.map([1, 2, 3], (i) => (
          <View
            key={i}
            className={`flex-1 items-center gap-1 ${i < 3 ? 'border-r border-border/50 dark:border-slate-700/50' : ''}`}
          >
            {/* value: text-lg (20px) */}
            <SkeletonBox width={32} height={20} rounded="sm" />
            {/* label: text-xs (12px) */}
            <SkeletonBox width={48} height={12} rounded="sm" />
          </View>
        ))}
      </View>

      {/* Menu Items — mirrors mt-4 gap-0 list of 9 ProfileMenuItem cards */}
      <View className="mt-4 gap-0">
        {Array.map(MENU_ITEMS, (item) => (
          <View
            key={item.id}
            className="mx-4 mb-3 rounded-xl p-4 bg-surface dark:bg-surface-dark border border-border/30 dark:border-slate-700/30 shadow-sm"
          >
            <View className="flex-row items-center">
              {/* icon circle: w-10 h-10 rounded-full mr-3 */}
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-surface-tinted dark:bg-primary/20">
                <SkeletonCircle size={20} />
              </View>
              {/* title: flex-1 text-sm font-bold */}
              <View className="flex-1">
                <SkeletonBox width="55%" height={14} rounded="sm" />
              </View>
              {/* trailing badge slot: mirrors `{badge && <View className="mr-2">}` */}
              {pipe(
                Option.fromNullable(item.badgeWidth),
                Option.match({
                  onNone: () => null,
                  onSome: (badgeWidth) => (
                    <View className="mr-2">
                      {/* Badge size sm: px-2 py-1 rounded-md, text-[10px] */}
                      <SkeletonBox
                        width={badgeWidth}
                        height={20}
                        rounded="sm"
                      />
                    </View>
                  ),
                })
              )}
              {/* chevron: 24px */}
              <SkeletonBox width={24} height={24} rounded="sm" />
            </View>
          </View>
        ))}
      </View>

      {/* Sign Out button section: items-center py-8 (text-base font-semibold) */}
      <View className="items-center py-8">
        <SkeletonBox width={80} height={18} rounded="sm" />
      </View>
    </ScrollView>
  )
}
