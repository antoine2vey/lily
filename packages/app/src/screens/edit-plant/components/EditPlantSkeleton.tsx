import { Array } from 'effect'
import { ScrollView, View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'

/**
 * Loading skeleton for EditPlantScreen. Mirrors the real edit form layout
 * (header, photo, basic-info inputs, pot size, care-needs card, care-schedule
 * section, danger zone) so there is zero layout shift when real data loads.
 *
 * The caller owns SafeArea padding and the FadeIn wrapper.
 */
export function EditPlantSkeleton() {
  return (
    <View
      testID="edit-plant-skeleton"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      {/* Header — mirrors px-4 py-3 border-b with cancel / title / save */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border/30 dark:border-slate-700/30">
        <View className="py-2">
          <SkeletonBox width={54} height={19} rounded="sm" />
        </View>
        <SkeletonBox width={90} height={22} rounded="sm" />
        <View className="py-2">
          <SkeletonBox width={42} height={19} rounded="sm" />
        </View>
      </View>

      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Photo — items-center py-8, 112px box with edit badge + change text */}
        <View className="items-center py-8">
          <View className="relative">
            {/* Photo: real image is w-28 h-28 rounded-3xl (112px, 40px radius).
                SkeletonBox rounded prop caps at 2xl (32px), so clip a square
                box with a 40px-radius wrapper to match exactly. */}
            <View className="rounded-[40px] overflow-hidden">
              <SkeletonBox width={112} height={112} rounded="none" />
            </View>
            <View className="absolute -bottom-1 -right-1">
              <SkeletonCircle size={36} />
            </View>
          </View>
          <View className="mt-3">
            <SkeletonBox width={110} height={18} rounded="sm" />
          </View>
        </View>

        {/* Basic Info — gap-5 mb-8: name input, category picker, description, room */}
        <View className="gap-5 mb-8">
          {/* Name (FormInput): text-sm label + gap-2 + py-3.5 border-2 input */}
          <View className="gap-2">
            <View className="ml-1">
              <SkeletonBox width={70} height={14} rounded="sm" />
            </View>
            <SkeletonBox width="100%" height={51} rounded="2xl" />
          </View>

          {/* Category (CategoryPicker): same shape as a FormInput */}
          <View className="gap-2">
            <View className="ml-1">
              <SkeletonBox width={80} height={14} rounded="sm" />
            </View>
            <SkeletonBox width="100%" height={51} rounded="2xl" />
          </View>

          {/* Description (FormTextArea): min-h-[120px] */}
          <View className="gap-2">
            <View className="ml-1">
              <SkeletonBox width={100} height={14} rounded="sm" />
            </View>
            <SkeletonBox width="100%" height={120} rounded="2xl" />
          </View>

          {/* Room — text-sm label + gap-2 + h-9 chip row */}
          <View className="gap-2">
            <View className="pl-1">
              <SkeletonBox width={50} height={14} rounded="sm" />
            </View>
            <View className="flex-row gap-2">
              <SkeletonBox width={90} height={36} rounded="full" />
              <SkeletonBox width={110} height={36} rounded="full" />
              <SkeletonBox width={100} height={36} rounded="full" />
            </View>
          </View>
        </View>

        {/* Pot Size — SectionHeader + mt-4 flex-row gap-4 two inputs */}
        <View className="mb-8">
          <SkeletonBox width={90} height={25} rounded="sm" />
          <View className="mt-4 flex-row gap-4">
            <View className="flex-1 gap-2">
              <View className="ml-1">
                <SkeletonBox width={70} height={14} rounded="sm" />
              </View>
              <SkeletonBox width="100%" height={51} rounded="2xl" />
            </View>
            <View className="flex-1 gap-2">
              <View className="ml-1">
                <SkeletonBox width={70} height={14} rounded="sm" />
              </View>
              <SkeletonBox width="100%" height={51} rounded="2xl" />
            </View>
          </View>
        </View>

        {/* Care Needs — SectionHeader + card (p-5 rounded-2xl border gap-6) */}
        <View className="mb-8">
          <SkeletonBox width={110} height={25} rounded="sm" />
          <View className="mt-4 bg-surface dark:bg-surface-dark p-5 rounded-2xl shadow-sm border border-border/30 dark:border-slate-700/30 gap-6">
            {/* 3 Sliders — each w-full gap-4: header row, 40px track, min/max */}
            {Array.map([0, 1, 2], (key) => (
              <View key={key} className="w-full gap-4">
                <View className="flex-row items-center gap-2">
                  <SkeletonCircle size={32} />
                  <SkeletonBox width={90} height={18} rounded="sm" />
                </View>
                <View className="h-10 justify-center">
                  <SkeletonBox width="100%" height={4} rounded="full" />
                </View>
                <View className="flex-row justify-between -mt-2">
                  <SkeletonBox width={40} height={12} rounded="sm" />
                  <SkeletonBox width={40} height={12} rounded="sm" />
                </View>
              </View>
            ))}

            {/* Pet-safe toggle row — pt-2 border-t, w-10 icon + 2 lines + switch */}
            <View className="flex-row items-center justify-between pt-2 border-t border-border/30 dark:border-slate-700/30">
              <View className="flex-row items-center gap-3">
                <SkeletonCircle size={40} />
                <View className="gap-1">
                  <SkeletonBox width={90} height={14} rounded="sm" />
                  <SkeletonBox width={150} height={12} rounded="sm" />
                </View>
              </View>
              <SkeletonBox width={51} height={31} rounded="full" />
            </View>
          </View>
        </View>

        {/* Care Schedule — SectionHeader + mt-4 gap-6 */}
        <View className="mb-8">
          <SkeletonBox width={130} height={25} rounded="sm" />
          <View className="mt-4 gap-6">
            {/* Watering — full FrequencyPicker: header + card (input + chips) */}
            <View className="gap-4">
              <View className="flex-row items-center gap-2">
                <SkeletonCircle size={20} />
                <SkeletonBox width={90} height={22} rounded="sm" />
              </View>
              <View className="bg-white dark:bg-surface-dark p-5 rounded-xl shadow-sm border border-border dark:border-slate-700 gap-4">
                <View className="gap-2">
                  <SkeletonBox width={110} height={14} rounded="sm" />
                  <SkeletonBox width="100%" height={56} rounded="xl" />
                </View>
                <View className="flex-row gap-2">
                  <SkeletonBox width={110} height={36} rounded="full" />
                  <SkeletonBox width={80} height={36} rounded="full" />
                  <SkeletonBox width={90} height={36} rounded="full" />
                </View>
              </View>
            </View>

            {/* Fertilizing / Misting / Repotting — toggle row + disabled hint */}
            {Array.map([0, 1, 2], (key) => (
              <View key={key} className="gap-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <SkeletonCircle size={20} />
                    <SkeletonBox width={100} height={22} rounded="sm" />
                  </View>
                  <SkeletonBox width={51} height={31} rounded="full" />
                </View>
                <View className="bg-surface-tinted dark:bg-slate-800 p-4 rounded-xl">
                  <View className="items-center">
                    <SkeletonBox width="70%" height={14} rounded="sm" />
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Danger Zone — uppercase label + delete button (p-4) */}
        <View>
          <View className="mb-3 ml-1">
            <SkeletonBox width={90} height={12} rounded="sm" />
          </View>
          <SkeletonBox width="100%" height={52} rounded="2xl" />
        </View>
      </ScrollView>
    </View>
  )
}
