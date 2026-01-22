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
import { EmptyState } from 'src/components/EmptyState'
import {
  useMarkAllAsRead,
  useMarkAsRead,
  useNotifications,
} from 'src/hooks/useNotifications'
import { iconColors } from 'src/theme'
import { NotificationItem } from './components/NotificationItem'

type TabFilter = 'all' | 'unread'
type NotificationType = 'care_reminder' | 'achievement' | 'tip' | 'system'

interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string
  read: boolean
  plantId?: string
  createdAt: string
}

const toNotificationType = (type: string): NotificationType => {
  if (
    type === 'care_reminder' ||
    type === 'achievement' ||
    type === 'tip' ||
    type === 'system'
  ) {
    return type
  }
  return 'system'
}

function groupByDate(
  notifications: Notification[]
): Map<string, Notification[]> {
  const groups = new Map<string, Notification[]>()

  notifications.forEach((notification) => {
    const date = new Date(notification.createdAt)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    let dateKey: string
    if (date.toDateString() === today.toDateString()) {
      dateKey = 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      dateKey = 'Yesterday'
    } else {
      dateKey = date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
    }

    const existing = groups.get(dateKey) ?? []
    groups.set(dateKey, [...existing, notification])
  })

  return groups
}

export function NotificationsScreen() {
  const [activeTab, setActiveTab] = useState<TabFilter>('all')

  const { data, isLoading } = useNotifications()
  const { mutate: markAsRead } = useMarkAsRead()
  const { mutate: markAllAsRead } = useMarkAllAsRead()

  const handleNotificationPress = (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      markAsRead({ path: { notificationId: notification.id } })
    }

    // Navigate based on notification type
    if (notification.plantId) {
      router.push(`/plant/${notification.plantId}` as const)
    } else if (notification.type === 'achievement') {
      router.push('/achievements')
    }
  }

  const handleGoBack = () => {
    router.back()
  }

  // Map API response to local Notification interface (isRead -> read)
  const notifications: Notification[] = pipe(
    data?.items ?? [],
    Array.map((n) => ({
      id: n.id,
      type: toNotificationType(n.type),
      title: n.title,
      body: n.body,
      read: n.isRead,
      plantId: n.plantId,
      createdAt: n.createdAt.toISOString(),
    }))
  )

  const filteredNotifications =
    activeTab === 'unread'
      ? pipe(
          notifications,
          Array.filter((n) => !n.read)
        )
      : notifications

  const groupedNotifications = groupByDate(filteredNotifications)
  const unreadCount = pipe(
    notifications,
    Array.filter((n) => !n.read),
    Array.length
  )

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={iconColors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <Pressable
          onPress={handleGoBack}
          className="w-10 h-10 items-center justify-center"
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <Text className="text-lg font-semibold text-text-primary">
          Notifications
        </Text>
        {unreadCount > 0 ? (
          <Pressable onPress={() => markAllAsRead()} className="py-2">
            <Text className="text-sm font-medium text-primary">
              Mark all read
            </Text>
          </Pressable>
        ) : (
          <View className="w-10" />
        )}
      </View>

      {/* Tabs */}
      <View className="flex-row px-4 py-2 border-b border-border">
        <Pressable onPress={() => setActiveTab('all')} className="mr-4 py-2">
          <Text
            className={`text-sm ${activeTab === 'all' ? 'font-semibold text-primary' : 'font-regular text-text-muted'}`}
          >
            All
          </Text>
          {activeTab === 'all' && (
            <View className="h-0.5 mt-1 rounded-full bg-primary" />
          )}
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('unread')}
          className="flex-row items-center py-2"
        >
          <Text
            className={`text-sm ${activeTab === 'unread' ? 'font-semibold text-primary' : 'font-regular text-text-muted'}`}
          >
            Unread
          </Text>
          {unreadCount > 0 && (
            <View className="ml-1.5 px-1.5 py-0.5 rounded-full bg-coral">
              <Text className="text-xs font-semibold text-white">
                {unreadCount}
              </Text>
            </View>
          )}
          {activeTab === 'unread' && (
            <View className="h-0.5 mt-1 rounded-full absolute bottom-0 left-0 right-0 bg-primary" />
          )}
        </Pressable>
      </View>

      {/* Content */}
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {filteredNotifications.length === 0 ? (
          <EmptyState
            illustration="notification"
            title={
              activeTab === 'unread'
                ? 'No unread notifications'
                : 'No notifications'
            }
            description={
              activeTab === 'unread'
                ? "You're all caught up!"
                : 'Notifications will appear here'
            }
          />
        ) : (
          [...groupedNotifications.entries()].map(
            ([dateKey, notificationList]: [string, Notification[]]) => (
              <View key={dateKey}>
                <Text className="text-xs font-medium text-text-muted bg-background uppercase px-4 py-2">
                  {dateKey}
                </Text>
                {pipe(
                  notificationList,
                  Array.map((notification: Notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onPress={() => handleNotificationPress(notification)}
                    />
                  ))
                )}
              </View>
            )
          )
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
