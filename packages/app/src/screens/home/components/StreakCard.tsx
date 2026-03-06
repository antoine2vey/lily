import { MaterialIcons } from '@expo/vector-icons'
import type { AchievementsResponse } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

interface StreakCardProps {
  data: AchievementsResponse
}

function deriveStreak(data: AchievementsResponse): number {
  return pipe(
    data.achievements,
    Array.findFirst((a) => a.key === 'DEDICATED_CARETAKER'),
    Option.flatMap((a) => Option.fromNullable(a.progress)),
    Option.getOrElse(() => 0)
  )
}

export function StreakCard({ data }: StreakCardProps) {
  const { t } = useTranslation('home')
  const iconColors = useIconColors()
  const isDark = iconColors.isDark
  const router = useRouter()

  const streak = useMemo(() => deriveStreak(data), [data])
  const hasStreak = streak > 0

  return (
    <Pressable
      onPress={() => router.push('/(app)/achievements')}
      className="rounded-[24px] p-4 mb-4 bg-surface dark:bg-surface-dark"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.2 : 0.06,
        shadowRadius: 8,
        elevation: 2,
      }}
      accessibilityRole="button"
      accessibilityLabel={t('streak.title')}
    >
      <View className="flex-row items-center gap-4">
        {/* Flame / streak icon */}
        <View
          className="w-12 h-12 rounded-full items-center justify-center shrink-0"
          style={{
            backgroundColor: pipe(
              Match.value(hasStreak),
              Match.when(true, () =>
                isDark ? 'rgba(251,191,36,0.15)' : '#FEF3C7'
              ),
              Match.orElse(() =>
                isDark ? 'rgba(156,163,175,0.15)' : '#F1F5F9'
              )
            ),
          }}
        >
          <MaterialIcons
            name={hasStreak ? 'local-fire-department' : 'spa'}
            size={24}
            color={hasStreak ? iconColors.warning : iconColors.textMuted}
          />
        </View>

        {/* Streak info */}
        <View className="flex-1 min-w-0">
          <Text className="text-[11px] font-bold uppercase tracking-wide mb-0.5 text-text-muted">
            {t('streak.title')}
          </Text>
          {hasStreak ? (
            <Text className="text-lg font-bold text-text-primary dark:text-white">
              {t('streak.days', { count: streak })}
            </Text>
          ) : (
            <Text className="text-sm font-semibold text-text-primary dark:text-white">
              {t('streak.noStreak')}
            </Text>
          )}
          {!hasStreak && (
            <Text className="text-xs font-medium text-text-muted">
              {t('streak.noStreakSubtitle')}
            </Text>
          )}
        </View>

        {/* Level badge */}
        <View className="items-end gap-1 shrink-0">
          <View
            className="px-2.5 py-1 rounded-full"
            style={{
              backgroundColor: isDark
                ? 'rgba(155, 199, 109, 0.2)'
                : 'rgba(91, 140, 90, 0.12)',
            }}
          >
            <Text
              className="text-xs font-bold"
              style={{ color: iconColors.primary }}
            >
              {t('streak.level', { level: data.level })}
            </Text>
          </View>
          <Text className="text-[10px] font-medium text-text-muted">
            {t('streak.achievements', { count: data.unlockedCount })}
          </Text>
        </View>

        <MaterialIcons
          name="chevron-right"
          size={20}
          color={isDark ? '#6B7280' : '#CBD5E1'}
        />
      </View>
    </Pressable>
  )
}
