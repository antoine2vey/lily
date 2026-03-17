import { MaterialIcons } from '@expo/vector-icons'
import type { AchievementCategory, AchievementWithProgress } from '@lily/shared'
import { Array, pipe } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ProgressBar } from 'src/components/ProgressBar'
import { SectionHeader } from 'src/components/SectionHeader'
import { SkeletonBox, SkeletonCircle } from 'src/components/skeletons'
import { useAchievements } from 'src/hooks/useAchievements'
import { useDelayedLoading } from 'src/hooks/useDelayedLoading'
import { useIconColors } from 'src/hooks/useIconColors'
import { AchievementCard } from 'src/screens/achievements/components/AchievementCard'
import { AchievementDetailModal } from 'src/screens/achievements/components/AchievementDetailModal'

export function AchievementsScreen() {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation('achievements')
  const iconColors = useIconColors()
  const { data, isLoading, error, refetch: _refetch } = useAchievements()
  const refetch = _refetch as () => void

  const CATEGORY_LABELS: Record<AchievementCategory, string> = {
    plants: t('categories.collection'),
    care: t('categories.care'),
    streaks: t('categories.streaks'),
    special: t('categories.special'),
  }
  const [selectedAchievement, setSelectedAchievement] =
    useState<AchievementWithProgress | null>(null)

  const isInitialLoading = isLoading && !data
  const showSkeleton = useDelayedLoading(isInitialLoading)

  if (error) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark items-center justify-center p-6"
        style={{ paddingTop: insets.top }}
      >
        <MaterialIcons
          name="error-outline"
          size={48}
          color={iconColors.coral}
        />
        <Text className="text-lg text-center mt-4 font-semibold text-text-primary dark:text-white">
          {t('error', { defaultValue: 'Failed to load achievements' })}
        </Text>
        <Pressable
          onPress={() => refetch()}
          className="mt-6 px-6 py-3 rounded-full bg-primary"
        >
          <Text className="font-semibold text-white">
            {t('tryAgain', { defaultValue: 'Try Again' })}
          </Text>
        </Pressable>
      </View>
    )
  }

  if (showSkeleton) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-center px-4 py-3 border-b border-border dark:border-slate-700">
          <View className="w-10 h-10" />
          <View className="flex-1 items-center mr-10">
            <SkeletonBox width={120} height={20} rounded="sm" />
          </View>
        </View>
        <Animated.View entering={FadeIn.duration(300)} className="p-6">
          <View className="items-center mb-6">
            <SkeletonCircle size={80} />
            <View className="mt-3">
              <SkeletonBox width={100} height={24} rounded="sm" />
            </View>
            <View className="mt-2">
              <SkeletonBox width={160} height={14} rounded="sm" />
            </View>
            <View className="mt-4 w-full px-8">
              <SkeletonBox width="100%" height={8} rounded="full" />
            </View>
          </View>
          <View className="flex-row flex-wrap mt-4">
            {Array.map([1, 2, 3, 4], (i) => (
              <View key={i} className="w-1/2 p-2">
                <SkeletonBox width="100%" height={120} rounded="lg" />
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    )
  }

  if (isInitialLoading || !data) {
    return null
  }

  const { achievements, level, unlockedCount, totalCount } = data
  const progress = unlockedCount / totalCount

  // Group achievements by category
  const groupedAchievements = pipe(
    ['plants', 'care', 'streaks', 'special'] as AchievementCategory[],
    Array.map((category) => ({
      category,
      achievements: pipe(
        achievements,
        Array.filter((a) => a.category === category)
      ),
    })),
    Array.filter((group) => !Array.isEmptyReadonlyArray(group.achievements))
  )

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border dark:border-slate-700">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center"
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <Text className="flex-1 text-lg text-center mr-10 font-semibold text-text-primary dark:text-white">
          {t('title')}
        </Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Level Header */}
        <View className="px-6 py-6 items-center bg-surface dark:bg-surface-dark">
          <View className="w-20 h-20 rounded-full items-center justify-center mb-3 bg-achievement-gold">
            <MaterialIcons
              name="emoji-events"
              size={40}
              color={iconColors.white}
            />
          </View>
          <Text className="text-2xl font-bold text-text-primary dark:text-white">
            {t('level', { level })}
          </Text>
          <Text className="text-sm mt-1 font-regular text-text-muted dark:text-slate-400">
            {t('progress', { unlocked: unlockedCount, total: totalCount })}
          </Text>
          <View className="w-full mt-4 px-8">
            <ProgressBar
              testID="progress-bar"
              progress={progress}
              height={8}
              color={iconColors.achievementGold}
              showPercentage
            />
          </View>
        </View>

        {/* Achievement Categories */}
        {pipe(
          groupedAchievements,
          Array.map((group) => (
            <View key={group.category} className="px-4 py-4">
              <SectionHeader title={CATEGORY_LABELS[group.category]} />
              <View className="flex-row flex-wrap mt-2">
                {pipe(
                  group.achievements,
                  Array.map((achievement) => (
                    <View key={achievement.key} className="w-1/2">
                      <AchievementCard
                        achievement={achievement}
                        onPress={() => setSelectedAchievement(achievement)}
                      />
                    </View>
                  ))
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Achievement Detail Modal */}
      <AchievementDetailModal
        visible={selectedAchievement !== null}
        onClose={() => setSelectedAchievement(null)}
        achievement={selectedAchievement}
      />
    </View>
  )
}
