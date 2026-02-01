import { MaterialIcons } from '@expo/vector-icons'
import { type DateInput, formatRelativeTime, parseApiDate } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import { Pressable, Text, View } from 'react-native'
import { SectionHeader } from 'src/components/SectionHeader'
import { useIconColors } from 'src/hooks/useIconColors'

type ActivityType =
  | 'watered'
  | 'fertilized'
  | 'added'
  | 'moved'
  | 'misted'
  | 'pruned'

interface Activity {
  id: string
  type: ActivityType
  plantId: string
  plantName: string
  timestamp: DateInput
  plantImageUrl?: string
}

interface RecentActivityProps {
  activities: Activity[]
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
    bgColor: isDark ? 'rgba(33, 150, 243, 0.2)' : '#E3F2FD',
  },
  fertilized: {
    icon: 'auto-awesome',
    color: isDark ? '#FBBF24' : '#FF9800',
    bgColor: isDark ? 'rgba(255, 152, 0, 0.2)' : '#FFF3E0',
  },
  added: {
    icon: 'eco',
    color: isDark ? '#9bc76d' : '#5B8C5A',
    bgColor: isDark ? 'rgba(91, 140, 90, 0.2)' : 'rgba(91, 140, 90, 0.1)',
  },
  moved: {
    icon: 'wb-sunny',
    color: isDark ? '#FBBF24' : '#F59E0B',
    bgColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
  },
  misted: {
    icon: 'grain',
    color: isDark ? '#93C5FD' : '#60A5FA',
    bgColor: isDark ? 'rgba(96, 165, 250, 0.2)' : '#DBEAFE',
  },
  pruned: {
    icon: 'content-cut',
    color: isDark ? '#F9A8D4' : '#E91E63',
    bgColor: isDark ? 'rgba(233, 30, 99, 0.2)' : '#FCE4EC',
  },
})

const formatActivityTitle = (type: ActivityType, plantName: string): string =>
  pipe(
    Match.value(type),
    Match.when('added', () => `New plant added: ${plantName}`),
    Match.when('moved', () => `Moved ${plantName} to light`),
    Match.when('misted', () => `${plantName} misted`),
    Match.when('watered', () => `${plantName} watered`),
    Match.when('fertilized', () => `${plantName} fertilized`),
    Match.when('pruned', () => `${plantName} pruned`),
    Match.exhaustive
  )

const formatActivityTime = (timestamp: DateInput): string =>
  pipe(
    parseApiDate(timestamp),
    Option.map(formatRelativeTime),
    Option.getOrElse(() => 'Unknown')
  )

interface ActivityItemProps {
  activity: Activity
  onPress: () => void
  activityConfig: Record<ActivityType, ActivityConfigItem>
}

function ActivityItem({
  activity,
  onPress,
  activityConfig,
}: ActivityItemProps) {
  const config = activityConfig[activity.type]
  const title = formatActivityTitle(activity.type, activity.plantName)

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
      accessibilityLabel={`${title}, ${formatActivityTime(activity.timestamp)}`}
    >
      {/* Activity Icon */}
      <View
        className="w-12 h-12 rounded-full items-center justify-center shrink-0"
        style={{ backgroundColor: config.bgColor }}
      >
        <MaterialIcons name={config.icon} size={24} color={config.color} />
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
          {formatActivityTime(activity.timestamp)}
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
  const iconColors = useIconColors()
  const activityConfig = getActivityConfig(iconColors.isDark)

  if (activities.length === 0) {
    return (
      <View>
        <SectionHeader title="Recent Activity" />
        <View className="bg-white dark:bg-surface-dark rounded-[20px] p-6 items-center">
          <Text className="text-sm text-text-muted dark:text-slate-400 text-center font-regular">
            No recent activity yet.{'\n'}Start caring for your plants!
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View>
      <View className="flex-row items-center justify-between mb-4 px-1">
        <Text className="text-lg text-text-primary dark:text-white tracking-tight font-bold">
          Recent Activity
        </Text>
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text className="text-sm font-semibold text-primary dark:text-primary-light">
            See All
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
            />
          ))
        )}
      </View>
    </View>
  )
}
