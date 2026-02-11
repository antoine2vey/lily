import { MaterialIcons } from '@expo/vector-icons'
import type { AchievementCategory, AchievementWithProgress } from '@lily/shared'
import { Array, pipe } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ProgressBar } from 'src/components/ProgressBar'
import { SectionHeader } from 'src/components/SectionHeader'
import { useAchievements } from 'src/hooks/useAchievements'
import { useIconColors } from 'src/hooks/useIconColors'
import { AchievementCard } from 'src/screens/achievements/components/AchievementCard'
import { AchievementDetailModal } from 'src/screens/achievements/components/AchievementDetailModal'

export function AchievementsScreen() {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation('achievements')
  const iconColors = useIconColors()
  const { data, isLoading } = useAchievements()

  const CATEGORY_LABELS: Record<AchievementCategory, string> = {
    plants: t('categories.collection'),
    care: t('categories.care'),
    streaks: t('categories.streaks'),
    special: t('categories.special'),
  }
  const [selectedAchievement, setSelectedAchievement] =
    useState<AchievementWithProgress | null>(null)

  if (isLoading || !data) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            testID="activity-indicator"
            size="large"
            color={iconColors.primary}
          />
        </View>
      </View>
    )
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

        {/* Bottom spacer */}
        <View className="h-8" />
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
