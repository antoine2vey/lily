import { MaterialIcons } from '@expo/vector-icons'
import type {
  AchievementsResponse,
  AchievementWithProgress,
} from '@lily/shared'
import { Array, Match, Order, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

interface AchievementTeaserProps {
  data: AchievementsResponse
}

type MaterialIconName = keyof typeof MaterialIcons.glyphMap

function getRarityColor(
  rarity: AchievementWithProgress['rarity'],
  isDark: boolean
): string {
  return pipe(
    Match.value(rarity),
    Match.when('common', () => (isDark ? '#9CA3AF' : '#6B7280')),
    Match.when('rare', () => (isDark ? '#60A5FA' : '#3B82F6')),
    Match.when('epic', () => (isDark ? '#C084FC' : '#A855F7')),
    Match.when('legendary', () => (isDark ? '#FBBF24' : '#F59E0B')),
    Match.exhaustive
  )
}

function findNextAchievements(
  data: AchievementsResponse
): ReadonlyArray<AchievementWithProgress> {
  return pipe(
    data.achievements,
    Array.filter(
      (a) =>
        !a.unlocked &&
        a.progress !== null &&
        a.maxProgress !== null &&
        a.maxProgress > 0
    ),
    Array.sort(
      Order.reverse(
        Order.mapInput(
          Order.number,
          (a: AchievementWithProgress) =>
            (a.progress ?? 0) / (a.maxProgress ?? 1)
        )
      )
    ),
    Array.take(2)
  )
}

interface AchievementRowProps {
  achievement: AchievementWithProgress
  iconColors: ReturnType<typeof useIconColors>
  t: ReturnType<typeof useTranslation>['t']
}

function AchievementRow({ achievement, iconColors, t }: AchievementRowProps) {
  const isDark = iconColors.isDark
  const progress = achievement.progress ?? 0
  const maxProgress = achievement.maxProgress ?? 1
  const ratio = Math.min(progress / maxProgress, 1)
  const remaining = maxProgress - progress
  const rarityColor = getRarityColor(achievement.rarity, isDark)

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        {/* Achievement icon */}
        <View
          className="w-9 h-9 rounded-full items-center justify-center shrink-0"
          style={{
            backgroundColor: isDark ? `${rarityColor}22` : `${rarityColor}18`,
          }}
        >
          <MaterialIcons
            name={achievement.icon as MaterialIconName}
            size={18}
            color={rarityColor}
          />
        </View>

        {/* Name + remaining */}
        <View className="flex-1 min-w-0">
          <Text
            className="text-sm font-semibold text-text-primary dark:text-white"
            numberOfLines={1}
          >
            {achievement.name}
          </Text>
          <Text className="text-xs font-medium text-text-muted">
            {t('achievementTeaser.xMore', { count: remaining })}
          </Text>
        </View>

        {/* Progress fraction */}
        <Text
          className="text-xs font-bold shrink-0"
          style={{ color: rarityColor }}
        >
          {progress}/{maxProgress}
        </Text>
      </View>

      {/* Progress bar */}
      <View
        className="h-1.5 rounded-full overflow-hidden"
        style={{
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
        }}
      >
        <View
          className="h-full rounded-full"
          style={{
            width: `${ratio * 100}%`,
            backgroundColor: rarityColor,
          }}
        />
      </View>
    </View>
  )
}

export function AchievementTeaser({ data }: AchievementTeaserProps) {
  const { t } = useTranslation('home')
  const iconColors = useIconColors()
  const isDark = iconColors.isDark
  const router = useRouter()

  const nextAchievements = useMemo(() => findNextAchievements(data), [data])

  if (Array.isEmptyReadonlyArray(nextAchievements)) return null

  return (
    <View className="mb-8">
      <View className="flex-row items-center justify-between mb-3 px-1">
        <Text className="text-base font-bold text-text-primary dark:text-white tracking-tight">
          {t('achievementTeaser.title')}
        </Text>
        <Pressable
          onPress={() => router.push('/(app)/achievements')}
          hitSlop={8}
        >
          <Text className="text-sm font-semibold text-primary dark:text-primary-light">
            {t('achievementTeaser.viewAll')}
          </Text>
        </Pressable>
      </View>

      <View
        className="rounded-[20px] p-4 gap-4 bg-surface dark:bg-surface-dark"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0.2 : 0.06,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        {pipe(
          nextAchievements,
          Array.map((achievement) => (
            <AchievementRow
              key={achievement.key}
              achievement={achievement}
              iconColors={iconColors}
              t={t}
            />
          ))
        )}
      </View>
    </View>
  )
}
