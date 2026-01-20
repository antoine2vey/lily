import { MaterialIcons } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import { colors, fonts } from 'src/theme'

interface NotificationBellProps {
  unreadCount?: number
  onPress: () => void
}

export function NotificationBell({
  unreadCount = 0,
  onPress,
}: NotificationBellProps) {
  const displayCount = unreadCount > 9 ? '9+' : unreadCount.toString()

  return (
    <Pressable
      onPress={onPress}
      className="w-11 h-11 items-center justify-center rounded-full bg-white"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      }}
      accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      accessibilityRole="button"
    >
      <MaterialIcons
        name="notifications-none"
        size={24}
        color={colors.textPrimary}
      />
      {unreadCount > 0 && (
        <View
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full items-center justify-center px-1"
          style={{ backgroundColor: colors.coral }}
        >
          <Text
            className="text-[10px] text-white"
            style={{ fontFamily: fonts.bold }}
          >
            {displayCount}
          </Text>
        </View>
      )}
    </Pressable>
  )
}
