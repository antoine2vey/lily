import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ProgressBar } from 'src/components/ProgressBar'
import { SectionHeader } from 'src/components/SectionHeader'
import { useAchievements } from 'src/hooks/useAchievements'
import { iconColors } from 'src/theme'
import { AchievementCard } from './components/AchievementCard'
import { AchievementDetailModal } from './components/AchievementDetailModal'

type AchievementCategory = 'plants' | 'care' | 'streaks' | 'special'

interface Achievement {
  id: string
  name: string
  description: string
  category: AchievementCategory
  icon: string
  unlocked: boolean
  unlockedAt?: string
  progress?: number
  maxProgress?: number
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  plants: 'Plant Collection',
  care: 'Plant Care',
  streaks: 'Streaks',
  special: 'Special',
}

export function AchievementsScreen() {
  const { data, isLoading } = useAchievements()
  const [selectedAchievement, setSelectedAchievement] =
    useState<Achievement | null>(null)

  if (isLoading || !data) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            testID="activity-indicator"
            size="large"
            color={iconColors.primary}
          />
        </View>
      </SafeAreaView>
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
    Array.filter((group) => group.achievements.length > 0)
  )

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
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
        <Text className="flex-1 text-lg text-center mr-10 font-semibold text-text-primary">
          Achievements
        </Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Level Header */}
        <View className="px-6 py-6 items-center bg-surface">
          <View className="w-20 h-20 rounded-full items-center justify-center mb-3 bg-achievement-gold">
            <MaterialIcons
              name="emoji-events"
              size={40}
              color={iconColors.white}
            />
          </View>
          <Text className="text-2xl font-bold text-text-primary">
            Level {level}
          </Text>
          <Text className="text-sm mt-1 font-regular text-text-muted">
            {unlockedCount} of {totalCount} achievements
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
                    <View key={achievement.id} className="w-1/2">
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
    </SafeAreaView>
  )
}
