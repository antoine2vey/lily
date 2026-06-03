import { Array } from 'effect'
import { ScrollView, View } from 'react-native'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'

// Mirrors EditProfileScreen: header (cancel / title / save) + AvatarPicker
// (120px circle = 112px + p-1 + border-2, with 32px edit badge + "Change
// Photo" text) + form fields (3 FormInputs and 1 FormTextArea inside a
// px-6 gap-6 column).
const INPUT_FIELDS = [0, 1, 2]

export function EditProfileSkeleton() {
  return (
    <View
      testID="edit-profile-skeleton"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      {/* Header — mirrors px-5 py-4 border-b row with cancel / title / save */}
      <View className="flex-row items-center justify-between px-5 py-4 border-b border-border/30 dark:border-slate-700/30">
        <SkeletonBox width={56} height={18} rounded="sm" />
        <SkeletonBox width={120} height={20} rounded="sm" />
        <SkeletonBox width={44} height={18} rounded="sm" />
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Avatar — mirrors AvatarPicker: items-center pt-8 pb-8 gap-3 */}
        <View className="items-center pt-8 pb-8 gap-3">
          <View className="relative">
            {/* w-28 h-28 (112px) + p-1 (4px) + border-2 (2px) = 120px outer */}
            <SkeletonCircle size={120} />
            {/* Edit badge: absolute bottom-0 right-0 w-8 h-8 (32px) */}
            <View className="absolute bottom-0 right-0">
              <SkeletonCircle size={32} />
            </View>
          </View>
          {/* "Change Photo" text-sm */}
          <SkeletonBox width={108} height={14} rounded="sm" />
        </View>

        {/* Form fields — mirrors px-6 gap-6 column */}
        <View className="px-6 gap-6">
          {Array.map(INPUT_FIELDS, (field) => (
            // FormInput: gap-2, label (text-sm ml-1) + rounded-2xl input
            <View key={field} className="gap-2">
              <View className="ml-1">
                <SkeletonBox width={88} height={14} rounded="sm" />
              </View>
              <SkeletonBox width="100%" height={56} rounded="2xl" />
            </View>
          ))}

          {/* FormTextArea (bio): label row + rounded-2xl min-h-[120px] area */}
          <View className="gap-2">
            <View className="flex-row justify-between items-end ml-1">
              <SkeletonBox width={64} height={14} rounded="sm" />
              <SkeletonBox width={36} height={12} rounded="sm" />
            </View>
            <SkeletonBox width="100%" height={120} rounded="2xl" />
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
