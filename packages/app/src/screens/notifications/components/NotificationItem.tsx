import { MaterialIcons } from '@expo/vector-icons'
import { formatApiRelativeTime } from '@lily/shared'
import { Match, pipe } from 'effect'
import { Pressable, Text, View } from 'react-native'
import { iconColors } from 'src/theme'

type NotificationType = 'care_reminder' | 'achievement' | 'tip' | 'system'

interface NotificationItemProps {
  notification: {
    id: string
    type: NotificationType
    title: string
    body: string
    read: boolean
    createdAt: string
  }
  onPress: () => void
}

interface TypeConfig {
  icon: keyof typeof MaterialIcons.glyphMap
  color: string
}

const getTypeConfig = (type: NotificationType): TypeConfig =>
  pipe(
    Match.value(type),
    Match.when('care_reminder', () => ({
      icon: 'water-drop' as const,
      color: iconColors.waterBlue,
    })),
    Match.when('achievement', () => ({
      icon: 'emoji-events' as const,
      color: iconColors.achievementGold,
    })),
    Match.when('tip', () => ({
      icon: 'lightbulb' as const,
      color: iconColors.primary,
    })),
    Match.when('system', () => ({
      icon: 'info' as const,
      color: iconColors.info,
    })),
    Match.exhaustive
  )

export function NotificationItem({
  notification,
  onPress,
}: NotificationItemProps) {
  const config = getTypeConfig(notification.type)

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row p-4 border-b border-border ${notification.read ? 'bg-background' : 'bg-primary-tint'}`}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        className="w-10 h-10 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: `${config.color}20` }}
      >
        <MaterialIcons name={config.icon} size={20} color={config.color} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text
            className={`text-base flex-1 mr-2 text-text-primary ${notification.read ? 'font-regular' : 'font-semibold'}`}
            numberOfLines={1}
          >
            {notification.title}
          </Text>
          <Text className="text-xs font-regular text-text-muted">
            {formatApiRelativeTime(notification.createdAt)}
          </Text>
        </View>
        <Text
          className="text-sm mt-1 font-regular text-text-secondary"
          numberOfLines={2}
        >
          {notification.body}
        </Text>
      </View>
      {!notification.read && (
        <View className="w-2 h-2 rounded-full ml-2 mt-2 bg-primary" />
      )}
    </Pressable>
  )
}
