import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { ProgressBar } from '@/components/ProgressBar'
import { useIconColors } from '@/hooks/useIconColors'

interface DailyProgressCardProps {
  completedToday: number
  remainingToday: number
}

export function DailyProgressCard({
  completedToday,
  remainingToday,
}: DailyProgressCardProps) {
  const { t } = useTranslation('home')
  const iconColors = useIconColors()

  const total = completedToday + remainingToday
  const allDone = total > 0 && remainingToday === 0
  const progress = total > 0 ? completedToday / total : 0

  return (
    <View
      className="rounded-[24px] p-4 mb-4 bg-surface dark:bg-surface-dark"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: iconColors.isDark ? 0.2 : 0.06,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      <View className="flex-row items-center gap-3 mb-3">
        <View
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{
            backgroundColor: allDone
              ? `${iconColors.success}20`
              : `${iconColors.primary}15`,
          }}
        >
          <MaterialIcons
            name={allDone ? 'check-circle' : 'task-alt'}
            size={22}
            color={allDone ? iconColors.success : iconColors.primary}
          />
        </View>
        <View className="flex-1">
          <Text
            className="text-base font-semibold text-text-primary dark:text-white"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {t('dailyProgress.title')}
          </Text>
          <Text className="text-sm text-text-muted dark:text-slate-400">
            {allDone
              ? t('dailyProgress.allDone')
              : t('dailyProgress.status', {
                  done: completedToday,
                  total,
                })}
          </Text>
        </View>
      </View>

      <ProgressBar
        progress={progress}
        color={allDone ? iconColors.success : iconColors.primary}
        height={6}
        animated
      />
    </View>
  )
}
