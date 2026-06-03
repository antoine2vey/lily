import { Array } from 'effect'
import { ScrollView, View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'

// Mirrors the real SettingsScreen section/row counts so the skeleton has
// zero layout shift when it swaps to real content:
//   Appearance (3 rows, each with a value) · Notifications (1) ·
//   Privacy (1) · Support (3) · Account (1)
const sections: ReadonlyArray<{
  id: string
  rows: number
  hasValue: boolean
}> = [
  { id: 'appearance', rows: 3, hasValue: true },
  { id: 'notifications', rows: 1, hasValue: false },
  { id: 'privacy', rows: 1, hasValue: false },
  { id: 'support', rows: 3, hasValue: false },
  { id: 'account', rows: 1, hasValue: false },
]

function SettingsRowSkeleton({
  hasValue,
  showBorder,
}: {
  hasValue: boolean
  showBorder: boolean
}) {
  return (
    <View
      className={`flex-row items-center gap-3 p-4 min-h-[64px] ${
        showBorder ? 'border-b border-border/50 dark:border-slate-700/50' : ''
      }`}
    >
      <View className="w-10 h-10 rounded-full items-center justify-center bg-primary-tint dark:bg-primary/20">
        <SkeletonCircle size={22} />
      </View>
      <View className="flex-1">
        <SkeletonBox width="50%" height={16} rounded="sm" />
      </View>
      <View className="flex-row items-center gap-2">
        {hasValue && <SkeletonBox width={56} height={14} rounded="sm" />}
        <SkeletonBox width={20} height={20} rounded="sm" />
      </View>
    </View>
  )
}

export function SettingsSkeleton() {
  return (
    <>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <View className="w-10 h-10" />
        <View className="flex-1 items-center mr-10">
          <SkeletonBox width={100} height={20} rounded="sm" />
        </View>
      </View>

      <ScrollView
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 24 }}
      >
        {Array.map(sections, (section) => (
          <View key={section.id} className="mb-6">
            <View className="mb-2 ml-3">
              <SkeletonBox width={110} height={12} rounded="sm" />
            </View>
            <View className="bg-surface dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-border/30 dark:border-slate-700/30">
              {Array.map(
                Array.makeBy(section.rows, (i) => i),
                (rowIndex) => (
                  <SettingsRowSkeleton
                    key={rowIndex}
                    hasValue={section.hasValue}
                    showBorder={rowIndex < section.rows - 1}
                  />
                )
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  )
}
