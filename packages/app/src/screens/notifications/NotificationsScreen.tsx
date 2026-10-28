import { MaterialIcons } from '@expo/vector-icons'
import type { Notification } from '@lily/shared'
import {
  formatRelativeTime,
  getApiDateGroupLabel,
  parseApiDate,
} from '@lily/shared'
import { Array, Match, Option, pipe, Record } from 'effect'
import { router } from 'expo-router'
import { useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EmptyState } from '@/components/EmptyState'
import { GlassBackButton } from '@/components/GlassBackButton'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import {
  useDeleteNotification,
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/useNotifications'
import { NotificationsSkeleton } from '@/screens/notifications/components/NotificationsSkeleton'
import { resolveNotificationRoute } from '@/utils/notifications'

// ─── Types ──────────────────────────────────────────────────────

type SectionItem =
  | { kind: 'header'; title: string }
  | { kind: 'notification'; data: Notification }

// ─── Helpers ────────────────────────────────────────────────────

const NOTIFICATION_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> =
  {
    watering_reminder: 'water-drop',
    fertilization_reminder: 'eco',
    misting_reminder: 'grain',
    repotting_reminder: 'swap-vert',
    overdue_reminder: 'warning',
    photo_reminder: 'photo-camera',
    new_follower: 'person-add',
    nudge_to_water: 'water-drop',
    delegation_request: 'handshake',
    delegation_accepted: 'check-circle',
    delegation_rejected: 'cancel',
    delegation_canceled: 'cancel',
    delegation_activated: 'play-arrow',
    delegation_completed: 'task-alt',
    canopy_member_joined: 'group-add',
    canopy_member_removed: 'person-remove',
    canopy_member_left: 'directions-walk',
    daily_tip: 'lightbulb',
    inactivity_nudge: 'notifications-active',
    plant_parent_milestone: 'emoji-events',
    gift_subscription: 'card-giftcard',
  }

const getNotificationIcon = (
  type: string
): keyof typeof MaterialIcons.glyphMap =>
  pipe(
    Record.get(NOTIFICATION_ICONS, type),
    Option.getOrElse(() => 'notifications' as const)
  )

const getIconColor = (type: string): string =>
  pipe(
    Match.value(type),
    Match.whenOr(
      'watering_reminder',
      'nudge_to_water',
      'misting_reminder',
      () => '#60A5FA'
    ),
    Match.when('fertilization_reminder', () => '#5B8C5A'),
    Match.when('overdue_reminder', () => '#EF4444'),
    Match.when('plant_parent_milestone', () => '#FCD34D'),
    Match.when('daily_tip', () => '#F59E0B'),
    Match.when('gift_subscription', () => '#FCD34D'),
    Match.whenOr('new_follower', 'delegation_request', () => '#8B5CF6'),
    Match.when('canopy_member_joined', () => '#5B8C5A'),
    Match.whenOr(
      'canopy_member_removed',
      'canopy_member_left',
      () => '#E8997E'
    ),
    Match.orElse(() => '#9CA3AF')
  )

const formatNotificationTime = (date: Date): string =>
  pipe(
    parseApiDate(date),
    Option.map((dt) => formatRelativeTime(dt)),
    Option.getOrElse(() => '')
  )

const groupByDate = (items: readonly Notification[]): SectionItem[] => {
  const groups = new Map<string, Notification[]>()
  const groupOrder: string[] = []

  Array.forEach(items, (item) => {
    const label = getApiDateGroupLabel(item.createdAt, 'UTC')
    const group = groups.get(label)
    if (group) {
      group.push(item)
    } else {
      groups.set(label, [item])
      groupOrder.push(label)
    }
  })

  const result: SectionItem[] = []
  Array.forEach(groupOrder, (label) => {
    result.push({ kind: 'header', title: label })
    const items = groups.get(label)
    if (items) {
      Array.forEach(items, (n) =>
        result.push({ kind: 'notification', data: n })
      )
    }
  })
  return result
}

// ─── Components ─────────────────────────────────────────────────

function DeleteAction() {
  return (
    <View className="bg-error justify-center items-center w-20">
      <MaterialIcons name="delete" size={24} color="white" />
    </View>
  )
}

function NotificationRow({
  item,
  onPress,
  onDelete,
}: {
  item: Notification
  onPress: () => void
  onDelete: () => void
}) {
  const swipeableRef = useRef<typeof ReanimatedSwipeable.prototype>(null)
  const iconColor = getIconColor(item.type)

  const handleSwipeOpen = useCallback(() => {
    swipeableRef.current?.close()
    onDelete()
  }, [onDelete])

  return (
    <Animated.View
      exiting={FadeOut.duration(200)}
      layout={LinearTransition.duration(300)}
    >
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderRightActions={() => <DeleteAction />}
        onSwipeableWillOpen={handleSwipeOpen}
        overshootRight={false}
      >
        <Pressable
          onPress={onPress}
          className={`flex-row items-start gap-3 px-6 py-3 ${
            item.isRead
              ? 'bg-background dark:bg-background-dark'
              : 'bg-primary-tint dark:bg-surface-dark'
          }`}
        >
          <View
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: `${iconColor}20` }}
          >
            <MaterialIcons
              name={getNotificationIcon(item.type)}
              size={20}
              color={iconColor}
            />
          </View>
          <View className="flex-1">
            {item.title ? (
              <Text
                className={`text-sm ${
                  item.isRead
                    ? 'text-text-primary dark:text-white'
                    : 'text-text-primary dark:text-white font-semibold'
                }`}
                numberOfLines={1}
              >
                {item.title}
              </Text>
            ) : null}
            {item.body ? (
              <Text
                className="text-xs text-text-secondary dark:text-text-muted mt-0.5"
                numberOfLines={2}
              >
                {item.body}
              </Text>
            ) : null}
            <Text className="text-[11px] text-text-muted mt-1">
              {formatNotificationTime(item.createdAt)}
            </Text>
          </View>
          {!item.isRead && (
            <View className="w-2.5 h-2.5 rounded-full bg-primary mt-1.5" />
          )}
        </Pressable>
      </ReanimatedSwipeable>
    </Animated.View>
  )
}

// ─── Main Screen ────────────────────────────────────────────────

export function NotificationsScreen() {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()

  const { data, isLoading, refetch } = useNotifications()
  const { mutate: markRead } = useMarkNotificationRead()
  const { mutate: markAllRead, isPending: isMarkingAllRead } = useMarkAllRead()
  const { mutate: deleteNotification } = useDeleteNotification()

  const isInitialLoading = isLoading && !data
  const showSkeleton = useDelayedLoading(isInitialLoading)

  const notifications = data?.items ?? []

  const unreadCount = Array.filter(notifications, (n) => !n.isRead).length

  const sections = useMemo(() => groupByDate(notifications), [notifications])

  const handleNotificationPress = useCallback(
    (item: Notification) => {
      if (!item.isRead) {
        markRead(item.id)
      }
      const route = resolveNotificationRoute({
        topic: item.type,
        plantIds: item.plantId ?? '',
        title: item.title ?? '',
        body: item.body ?? '',
      })
      if (route) {
        router.push(route)
      }
    },
    [markRead]
  )

  const renderItem = useCallback(
    ({ item }: { item: SectionItem }) => {
      if (item.kind === 'header') {
        return (
          <View className="px-6 pt-4 pb-1">
            <Text
              className="text-[11px] text-text-muted uppercase tracking-wide"
              style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
            >
              {item.title}
            </Text>
          </View>
        )
      }
      return (
        <NotificationRow
          item={item.data}
          onPress={() => handleNotificationPress(item.data)}
          onDelete={() => deleteNotification(item.data.id)}
        />
      )
    },
    [handleNotificationPress, deleteNotification]
  )

  const keyExtractor = useCallback(
    (item: SectionItem) =>
      item.kind === 'header' ? `header-${item.title}` : item.data.id,
    []
  )

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 pt-4 pb-2">
        <View className="flex-row items-center gap-3">
          <GlassBackButton />
          <Text
            className="text-xl text-text-primary dark:text-white font-bold"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
          >
            {t('settings:sections.notifications')}
          </Text>
        </View>
        {unreadCount > 0 && (
          <Pressable
            onPress={() => markAllRead()}
            disabled={isMarkingAllRead}
            className="px-3 py-1.5 rounded-full bg-primary-tint dark:bg-surface-dark"
          >
            {isMarkingAllRead ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text
                className="text-xs text-primary font-semibold"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              >
                {t('notifications:markAllRead', {
                  defaultValue: 'Mark all read',
                })}
              </Text>
            )}
          </Pressable>
        )}
      </View>

      {/* Content */}
      {showSkeleton ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <NotificationsSkeleton />
        </Animated.View>
      ) : isInitialLoading ? null : notifications.length === 0 ? (
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          <EmptyState kind="notifications" />
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          <Animated.FlatList
            data={sections}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            onRefresh={refetch}
            refreshing={isLoading && !!data}
            itemLayoutAnimation={LinearTransition.duration(300)}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          />
        </Animated.View>
      )}
    </View>
  )
}
