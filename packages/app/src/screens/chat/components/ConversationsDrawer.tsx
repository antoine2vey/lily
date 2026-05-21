import { MaterialIcons } from '@expo/vector-icons'
import { formatApiDateWith } from '@lily/shared'
import { Array, DateTime, Option, pipe } from 'effect'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '@/components/Avatar'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'
import { useConversations } from '@/hooks/useConversations'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useIconColors } from '@/hooks/useIconColors'

const SCREEN_WIDTH = Dimensions.get('window').width
const DRAWER_WIDTH = Math.min(320, SCREEN_WIDTH * 0.85)
const OPEN_DURATION = 240
const CLOSE_DURATION = 220
const SWIPE_CLOSE_THRESHOLD = DRAWER_WIDTH / 3
const SWIPE_VELOCITY_THRESHOLD = -500

interface Conversation {
  id: string
  kind: 'general' | 'plant'
  title?: string | undefined
  plantId?: string | undefined
  lastMessageAt: Date | string
}

interface ConversationsDrawerProps {
  visible: boolean
  onClose: () => void
  currentConversationId?: string | undefined
  onSelectConversation: (id: string) => void
  onNewChat: () => void
}

const formatLastAt = formatApiDateWith(
  DateTime.formatLocal({ dateStyle: 'medium' }),
  ''
)

function ConversationRow({
  conversation,
  isCurrent,
  checkColor,
  onPress,
}: {
  conversation: Conversation
  isCurrent: boolean
  checkColor: string
  onPress: () => void
}) {
  const { t } = useTranslation('chat')
  const lastAtLabel = formatLastAt(conversation.lastMessageAt)
  const fallbackTitle =
    conversation.kind === 'plant'
      ? t('drawer.untitledPlant', { defaultValue: 'Plant chat' })
      : t('drawer.untitledGeneral', { defaultValue: 'New conversation' })
  const title = conversation.title ?? fallbackTitle

  return (
    <Pressable
      testID={`drawer-conversation-${conversation.id}`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      className={`flex-row items-center p-3 rounded-xl mb-2 ${isCurrent ? 'bg-primary-tint dark:bg-primary/20' : ''}`}
    >
      <Avatar name="Lily" size="sm" />
      <View className="flex-1 ml-3">
        <Text
          className="text-sm text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text className="text-xs text-text-muted dark:text-slate-400 mt-0.5">
          {lastAtLabel}
        </Text>
      </View>
      {isCurrent && <MaterialIcons name="check" size={18} color={checkColor} />}
    </Pressable>
  )
}

function SkeletonRow() {
  return (
    <View className="flex-row items-center p-3 rounded-xl mb-2">
      <SkeletonCircle size={32} />
      <View className="flex-1 ml-3">
        <SkeletonBox width="60%" height={14} rounded="sm" />
        <View className="mt-1.5">
          <SkeletonBox width={70} height={10} rounded="sm" />
        </View>
      </View>
    </View>
  )
}

export function ConversationsDrawer({
  visible,
  onClose,
  currentConversationId,
  onSelectConversation,
  onNewChat,
}: ConversationsDrawerProps) {
  const { t } = useTranslation('chat')
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()
  const { isLoading, data } = useConversations()

  const [rendered, setRendered] = useState(false)
  const translateX = useSharedValue(-DRAWER_WIDTH)

  useEffect(() => {
    if (visible) setRendered(true)
  }, [visible])

  useEffect(() => {
    if (!rendered) return
    if (visible) {
      translateX.value = withTiming(0, { duration: OPEN_DURATION })
    } else {
      translateX.value = withTiming(
        -DRAWER_WIDTH,
        { duration: CLOSE_DURATION },
        (finished) => {
          if (finished) runOnJS(setRendered)(false)
        }
      )
    }
  }, [visible, rendered, translateX])

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  const backdropStyle = useAnimatedStyle(() => {
    const progress = 1 - Math.min(1, Math.abs(translateX.value) / DRAWER_WIDTH)
    return { opacity: progress * 0.5 }
  })

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .onUpdate((e) => {
          // Drawer is at x=0 when open; only allow leftward drag
          const next = Math.min(0, e.translationX)
          translateX.value = Math.max(-DRAWER_WIDTH, next)
        })
        .onEnd((e) => {
          const shouldClose =
            e.translationX < -SWIPE_CLOSE_THRESHOLD ||
            e.velocityX < SWIPE_VELOCITY_THRESHOLD
          if (shouldClose) {
            runOnJS(onClose)()
          } else {
            translateX.value = withTiming(0, { duration: 180 })
          }
        }),
    [onClose, translateX]
  )

  const conversations: Conversation[] = useMemo(
    () =>
      pipe(
        Option.fromNullable(data?.items),
        Option.map((items) =>
          Array.map(items, (c) => ({
            id: c.id,
            kind: c.kind as 'general' | 'plant',
            title: c.title,
            plantId: c.plantId,
            lastMessageAt: c.lastMessageAt,
          }))
        ),
        Option.getOrElse(() => [] as Conversation[])
      ),
    [data?.items]
  )

  const isInitialLoading = isLoading && !data
  const showSkeleton = useDelayedLoading(isInitialLoading)

  const handleSelect = useCallback(
    (id: string) => {
      onClose()
      if (id !== currentConversationId) {
        onSelectConversation(id)
      }
    },
    [currentConversationId, onClose, onSelectConversation]
  )

  const handleNewChat = useCallback(() => {
    onClose()
    onNewChat()
  }, [onClose, onNewChat])

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationRow
        conversation={item}
        isCurrent={item.id === currentConversationId}
        checkColor={iconColors.primary}
        onPress={() => handleSelect(item.id)}
      />
    ),
    [currentConversationId, handleSelect, iconColors.primary]
  )

  return (
    <Modal
      visible={rendered}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFillObject}>
        <Animated.View
          pointerEvents={visible ? 'auto' : 'none'}
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: 'black' },
            backdropStyle,
          ]}
        >
          <Pressable
            testID="drawer-backdrop"
            onPress={onClose}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            className="bg-background dark:bg-background-dark"
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: DRAWER_WIDTH,
                paddingTop: insets.top + 8,
                paddingBottom: insets.bottom,
                paddingHorizontal: 16,
                shadowColor: '#000',
                shadowOffset: { width: 2, height: 0 },
                shadowOpacity: 0.2,
                shadowRadius: 12,
                elevation: 12,
              },
              drawerStyle,
            ]}
          >
            <View className="flex-row items-center justify-between mb-4 pt-2">
              <Text
                className="text-xl text-text-primary dark:text-white"
                style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
              >
                {t('drawer.title', { defaultValue: 'Conversations' })}
              </Text>
              <Pressable
                testID="drawer-close"
                onPress={onClose}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                className="w-9 h-9 items-center justify-center rounded-full"
              >
                <MaterialIcons
                  name="close"
                  size={20}
                  color={iconColors.textPrimary}
                />
              </Pressable>
            </View>

            <Pressable
              testID="drawer-new-chat"
              onPress={handleNewChat}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              className="flex-row items-center p-3 rounded-xl mb-3 bg-primary-tint dark:bg-primary/20"
            >
              <View className="w-8 h-8 rounded-full bg-primary items-center justify-center">
                <MaterialIcons name="add" size={18} color={iconColors.white} />
              </View>
              <Text
                className="ml-3 text-sm text-primary dark:text-primary-light"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              >
                {t('drawer.newChat', { defaultValue: 'New conversation' })}
              </Text>
            </Pressable>

            {showSkeleton ? (
              <View>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </View>
            ) : (
              <FlatList
                data={conversations}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={
                  <View className="items-center py-8">
                    <Text className="text-sm text-text-muted dark:text-slate-400 text-center px-4">
                      {t('drawer.empty', {
                        defaultValue: 'No past conversations yet.',
                      })}
                    </Text>
                  </View>
                }
                showsVerticalScrollIndicator={false}
              />
            )}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  )
}
