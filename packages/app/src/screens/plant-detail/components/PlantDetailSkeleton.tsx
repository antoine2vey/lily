import { Array } from 'effect'
import { Dimensions, View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'

const HERO_HEIGHT = Dimensions.get('window').height * 0.45

export function PlantDetailSkeleton() {
  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      testID="plant-detail-skeleton"
    >
      {/* Hero image */}
      <SkeletonBox width="100%" height={HERO_HEIGHT} rounded="none" />

      {/* Content card with overlap */}
      <View
        className="bg-background dark:bg-background-dark px-6 pb-8 -mt-12"
        style={{ borderTopLeftRadius: 40, borderTopRightRadius: 40 }}
      >
        {/* Drag handle */}
        <View className="w-12 h-1.5 bg-border dark:bg-slate-600 rounded-full mx-auto mt-4 mb-6 opacity-50" />

        {/* PlantHeader: 28px name (flex-1) + health badge */}
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <SkeletonBox width="70%" height={28} rounded="sm" />
          </View>
          <SkeletonBox width={64} height={22} rounded="full" />
        </View>
        {/* Species line + pot pill row (mt-1) */}
        <View className="flex-row items-center flex-wrap gap-2 mt-1">
          <SkeletonBox width="45%" height={14} rounded="sm" />
        </View>

        {/* Room badge pill (mt-2): flex-row px-3 py-1.5, emoji + name */}
        <View className="mt-2 self-start">
          <SkeletonBox width={100} height={30} rounded="full" />
        </View>

        {/* ChatCTA card (mt-8): rounded-3xl p-5 border */}
        <View className="mt-8 bg-surface dark:bg-surface-dark rounded-3xl p-5 border border-primary/20 shadow-lg">
          <View className="flex-row items-center">
            <View className="mr-4">
              <SkeletonCircle size={48} />
            </View>
            <View className="flex-1">
              {/* title: text-base font-bold (~18px line-height) */}
              <SkeletonBox width="70%" height={18} rounded="sm" />
              <View className="mt-0.5">
                <SkeletonBox width="55%" height={14} rounded="sm" />
              </View>
            </View>
            <SkeletonCircle size={32} />
          </View>
        </View>

        {/* Care Schedule (mt-10): section header + correct-dates link + care cards */}
        <View className="mt-10">
          <View className="flex-row items-center justify-between">
            <SkeletonBox width={140} height={20} rounded="sm" />
            <SkeletonBox width={40} height={14} rounded="sm" />
          </View>
          {/* Correct Care Dates link (mt-1): text-xs underline, ~16px tall */}
          <View className="mt-1">
            <SkeletonBox width={130} height={16} rounded="sm" />
          </View>
          {/* Care cards: watering always present; fertilizing/misting common.
              Repotting is often > 14 days out and hidden. Representative: 3. */}
          <View className="gap-3 mt-4">
            {Array.map([1, 2, 3], (i) => (
              <View
                key={i}
                className="flex-row items-center p-4 rounded-xl bg-surface dark:bg-surface-dark border border-border dark:border-slate-700"
              >
                <SkeletonCircle size={40} />
                <View className="flex-1 ml-3">
                  <SkeletonBox width="45%" height={14} rounded="sm" />
                  <View className="mt-1">
                    <SkeletonBox width="55%" height={16} rounded="sm" />
                  </View>
                  <View className="mt-1">
                    <SkeletonBox width="35%" height={12} rounded="sm" />
                  </View>
                </View>
                {/* Trailing action ('Do Now' / 'Already Done'): py-2 px-3
                    rounded-lg, text-xs. Present on the watering card in the
                    common due/first-time case. */}
                {i === 1 && <SkeletonBox width={80} height={32} rounded="md" />}
              </View>
            ))}
          </View>
        </View>

        {/* Ideal Environment (mt-10): section header + card with 3 rows */}
        <View className="mt-10">
          <SkeletonBox width={170} height={20} rounded="sm" />
          <View className="mt-4 bg-surface dark:bg-surface-dark p-6 rounded-3xl shadow-sm border border-border/30 dark:border-slate-700/30 gap-6">
            {Array.map([1, 2, 3], (i) => (
              <View key={i} className="flex-row items-center gap-4">
                <SkeletonCircle size={40} />
                <View className="flex-1">
                  <View className="flex-row justify-between mb-2">
                    <SkeletonBox width="40%" height={14} rounded="sm" />
                    {/* badge: px-2 py-0.5 text-xs rounded-md (~16px tall) */}
                    <SkeletonBox width={56} height={16} rounded="md" />
                  </View>
                  {/* progress track: h-2.5 (10px) rounded-full */}
                  <SkeletonBox width="100%" height={10} rounded="full" />
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Growth Journal (mt-10): header + age pill + 3 tiles */}
        <View className="mt-10">
          <View className="flex-row justify-between items-center mb-3">
            <SkeletonBox width={130} height={20} rounded="sm" />
            <SkeletonBox width={64} height={16} rounded="sm" />
          </View>
          <View className="mb-4">
            <SkeletonBox width={180} height={24} rounded="full" />
          </View>
          <View className="flex-row mb-4" style={{ gap: 8 }}>
            {Array.map([1, 2, 3], (i) => (
              <View key={i} className="flex-1 aspect-square">
                <SkeletonBox width="100%" height="100%" rounded="2xl" />
              </View>
            ))}
          </View>
          <SkeletonBox width="100%" height={48} rounded="2xl" />
        </View>

        {/* Recent History (mt-10 mb-4): section header + 3 items */}
        <View className="mt-10 mb-4">
          <View className="flex-row items-center justify-between">
            <SkeletonBox width={150} height={20} rounded="sm" />
            <SkeletonBox width={56} height={14} rounded="sm" />
          </View>
          <View className="mt-4">
            {Array.map([1, 2, 3], (i) => (
              <View key={i} className="flex-row items-center py-1.5">
                <View className="w-2 h-2 rounded-full mr-3 bg-border dark:bg-slate-600" />
                <View className="flex-1">
                  <SkeletonBox width="40%" height={16} rounded="sm" />
                </View>
                <SkeletonBox width={64} height={14} rounded="sm" />
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  )
}
