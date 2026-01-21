import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { Pressable, Text, View } from 'react-native'
import { SectionHeader } from 'src/components/SectionHeader'

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
  plantName: string
  timestamp: Date
  plantImageUrl?: string
}

interface RecentActivityProps {
  activities: Activity[]
  onSeeAll: () => void
  onActivityPress: (activityId: string) => void
}

type MaterialIconName = keyof typeof MaterialIcons.glyphMap

const ACTIVITY_CONFIG: Record<
  ActivityType,
  { icon: MaterialIconName; color: string; bgColor: string }
> = {
  watered: { icon: 'water-drop', color: '#2196F3', bgColor: '#E3F2FD' },
  fertilized: { icon: 'auto-awesome', color: '#FF9800', bgColor: '#FFF3E0' },
  added: { icon: 'eco', color: '#5B8C5A', bgColor: 'rgba(91, 140, 90, 0.1)' },
  moved: { icon: 'wb-sunny', color: '#F59E0B', bgColor: '#FEF3C7' },
  misted: { icon: 'grain', color: '#60A5FA', bgColor: '#DBEAFE' },
  pruned: { icon: 'content-cut', color: '#E91E63', bgColor: '#FCE4EC' },
}

function formatActivityTitle(type: ActivityType, plantName: string): string {
  switch (type) {
    case 'added':
      return `New plant added: ${plantName}`
    case 'moved':
      return `Moved ${plantName} to light`
    case 'misted':
      return `${plantName} misted`
    case 'watered':
      return `${plantName} watered`
    case 'fertilized':
      return `${plantName} fertilized`
    case 'pruned':
      return `${plantName} pruned`
  }
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString()
}

function ActivityItem({
  activity,
  onPress,
}: {
  activity: Activity
  onPress: () => void
}) {
  const config = ACTIVITY_CONFIG[activity.type]
  const title = formatActivityTitle(activity.type, activity.plantName)

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-white rounded-[20px] p-4 mb-3"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 2,
        elevation: 1,
      }}
      accessibilityLabel={`${title}, ${formatRelativeTime(activity.timestamp)}`}
    >
      {/* Activity Icon */}
      <View
        className="w-12 h-12 rounded-full items-center justify-center mr-4"
        style={{ backgroundColor: config.bgColor }}
      >
        <MaterialIcons name={config.icon} size={24} color={config.color} />
      </View>

      {/* Content */}
      <View className="flex-1 min-w-0">
        <Text className="text-sm text-text-primary font-bold" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-xs text-text-muted mt-0.5 font-medium">
          {formatRelativeTime(activity.timestamp)}
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
  if (activities.length === 0) {
    return (
      <View>
        <SectionHeader title="Recent Activity" />
        <View className="bg-white rounded-[20px] p-6 items-center">
          <Text className="text-sm text-text-muted text-center font-regular">
            No recent activity yet.{'\n'}Start caring for your plants!
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View>
      <View className="flex-row items-center justify-between mb-4 px-1">
        <Text className="text-lg text-text-primary tracking-tight font-bold">
          Recent Activity
        </Text>
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text className="text-sm font-semibold text-primary">See All</Text>
        </Pressable>
      </View>
      {pipe(
        activities,
        Array.map((activity) => (
          <ActivityItem
            key={activity.id}
            activity={activity}
            onPress={() => onActivityPress(activity.id)}
          />
        ))
      )}
    </View>
  )
}
