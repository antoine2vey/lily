import type { MaterialIcons } from '@expo/vector-icons'
import { type DateInput, getRelativeTime, parseApiDate } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import type { i18n as I18n, TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { PlantImageBadge } from '@/components/PlantImageBadge'
import { SectionHeader } from '@/components/SectionHeader'
import { useIconColors } from '@/hooks/useIconColors'

type ActivityType =
  | 'watered'
  | 'fertilized'
  | 'added'
  | 'moved'
  | 'misted'
  | 'repotted'
  | 'pruned'

interface Activity {
  id: string
  type: ActivityType
  plantId: string
  plantName: string
  timestamp: DateInput
  plantImageUrl?: string | undefined
}

interface RecentActivityProps {
  activities: readonly Activity[]
  onSeeAll: () => void
  onActivityPress: (activityId: string) => void
}

type MaterialIconName = keyof typeof MaterialIcons.glyphMap

interface ActivityConfigItem {
  icon: MaterialIconName
  color: string
  bgColor: string
}

const getActivityConfig = (
  isDark: boolean
): Record<ActivityType, ActivityConfigItem> => ({
  watered: {
    icon: 'water-drop',
    color: isDark ? '#93C5FD' : '#2196F3',
    bgColor: isDark ? '#1E3A5F' : '#E3F2FD',
  },
  fertilized: {
    icon: 'auto-awesome',
    color: isDark ? '#FBBF24' : '#FF9800',
    bgColor: isDark ? '#4A3520' : '#FFF3E0',
  },
  added: {
    icon: 'eco',
    color: isDark ? '#9bc76d' : '#5B8C5A',
    bgColor: isDark ? '#2D3728' : '#E8F5E8',
  },
  moved: {
    icon: 'wb-sunny',
    color: isDark ? '#FBBF24' : '#F59E0B',
    bgColor: isDark ? '#4A3A1A' : '#FEF3C7',
  },
  misted: {
    icon: 'grain',
    color: isDark ? '#93C5FD' : '#60A5FA',
    bgColor: isDark ? '#1E3050' : '#DBEAFE',
  },
  repotted: {
    icon: 'yard',
    color: isDark ? '#A7F3D0' : '#059669',
    bgColor: isDark ? '#1A3A2A' : '#D1FAE5',
  },
  pruned: {
    icon: 'content-cut',
    color: isDark ? '#F9A8D4' : '#E91E63',
    bgColor: isDark ? '#3A1A28' : '#FCE4EC',
  },
})

const formatActivityTitle = (
  type: ActivityType,
  plantName: string,
  t: TFunction
): string =>
  pipe(
    Match.value(type),
    Match.when('added', () =>
      t('home:activity.plantAdded', { name: plantName })
    ),
    Match.when('moved', () =>
      t('home:activity.plantMoved', { name: plantName })
    ),
    Match.when('misted', () =>
      t('home:activity.plantMisted', { name: plantName })
    ),
    Match.when('watered', () =>
      t('home:activity.plantWatered', { name: plantName })
    ),
    Match.when('fertilized', () =>
      t('home:activity.plantFertilized', { name: plantName })
    ),
    Match.when('repotted', () =>
      t('home:activity.plantRepotted', { name: plantName })
    ),
    Match.when('pruned', () =>
      t('home:activity.plantPruned', { name: plantName })
    ),
    Match.exhaustive
  )

const formatRelativeTimeResult = (
  result: ReturnType<typeof getRelativeTime>,
  i18n: I18n
): string =>
  pipe(
    Match.value(result),
    Match.when({ _tag: 'now' }, () => i18n.t('time.justNow', { ns: 'common' })),
    Match.when({ _tag: 'minutes' }, ({ value }) =>
      i18n.t('time.minutesAgo', { ns: 'common', count: value })
    ),
    Match.when({ _tag: 'hours' }, ({ value }) =>
      i18n.t('time.hoursAgo', { ns: 'common', count: value })
    ),
    Match.when({ _tag: 'days' }, ({ value }) =>
      value === 1
        ? i18n.t('time.yesterday', { ns: 'common' })
        : i18n.t('time.daysAgo', { ns: 'common', count: value })
    ),
    Match.when({ _tag: 'date' }, ({ formatted }) => formatted),
    Match.exhaustive
  )

const formatActivityTime = (
  timestamp: DateInput,
  t: TFunction,
  i18n: I18n
): string =>
  pipe(
    parseApiDate(timestamp),
    Option.map((dt) =>
      formatRelativeTimeResult(getRelativeTime(dt, i18n.language), i18n)
    ),
    Option.getOrElse(() => t('activity.unknownTime'))
  )

interface ActivityItemProps {
  activity: Activity
  onPress: () => void
  activityConfig: Record<ActivityType, ActivityConfigItem>
  t: TFunction
  i18n: I18n
}

function ActivityItem({
  activity,
  onPress,
  activityConfig,
  t,
  i18n,
}: ActivityItemProps) {
  const config = activityConfig[activity.type]
  const title = formatActivityTitle(activity.type, activity.plantName, t)

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-white dark:bg-surface-dark rounded-[20px] p-4 gap-4"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 2,
        elevation: 1,
      }}
      accessibilityLabel={`${title}, ${formatActivityTime(activity.timestamp, t, i18n)}`}
    >
      {/* Plant image with activity icon badge */}
      <View className="shrink-0">
        <PlantImageBadge
          imageUrl={activity.plantImageUrl}
          size={48}
          badgeIcon={config.icon}
          badgeColor={config.color}
          badgeBgColor={config.bgColor}
        />
      </View>

      {/* Content */}
      <View className="flex-1 min-w-0">
        <Text
          className="text-sm text-text-primary dark:text-white font-bold"
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
          {formatActivityTime(activity.timestamp, t, i18n)}
        </Text>
      </View>
    </Pressable>
  )
}

export function RecentActivity({
  activities,
  onSeeAll,
  onActivityPress,
}: RecentActivityProps) {
  const { t, i18n } = useTranslation('home')
  const iconColors = useIconColors()
  const activityConfig = getActivityConfig(iconColors.isDark)

  if (Array.isEmptyReadonlyArray(activities)) {
    return (
      <View>
        <SectionHeader title={t('sections.recentActivity')} />
        <View className="bg-white dark:bg-surface-dark rounded-[20px] p-6 items-center">
          <Text className="text-sm text-text-muted dark:text-slate-400 text-center font-regular">
            {t('activity.noActivity')}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View>
      <View className="flex-row items-center justify-between mb-4 px-1">
        <Text className="text-lg text-text-primary dark:text-white tracking-tight font-bold">
          {t('sections.recentActivity')}
        </Text>
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text className="text-sm font-semibold text-primary dark:text-primary-light">
            {t('sections.seeAll')}
          </Text>
        </Pressable>
      </View>
      <View className="gap-3">
        {pipe(
          activities,
          Array.map((activity) => (
            <ActivityItem
              key={activity.id}
              activity={activity}
              onPress={() => onActivityPress(activity.id)}
              activityConfig={activityConfig}
              t={t}
              i18n={i18n}
            />
          ))
        )}
      </View>
    </View>
  )
}
