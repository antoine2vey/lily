import { MaterialIcons } from '@expo/vector-icons'
import { formatApiDateWith } from '@lily/shared'
import { Array, DateTime, Either, Option, pipe } from 'effect'
import { router } from 'expo-router'
import { useCallback } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '@/components/Avatar'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'
import { useConversations } from '@/hooks/useConversations'
import { useCreateConversation } from '@/hooks/useCreateConversation'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useIconColors } from '@/hooks/useIconColors'

interface Conversation {
  id: string
  kind: 'general' | 'plant'
  title?: string | undefined
  plantId?: string | undefined
  lastMessageAt: Date | string
}

const formatLastAt = formatApiDateWith(
  DateTime.formatLocal({ dateStyle: 'medium' }),
  ''
)

const ConversationRow = ({ conversation }: { conversation: Conversation }) => {
  const lastAtLabel = formatLastAt(conversation.lastMessageAt)

  const title =
    conversation.title ??
    (conversation.kind === 'plant' ? 'Plant chat' : 'New conversation')

  return (
    <Pressable
      testID={`conversation-${conversation.id}`}
      onPress={() => router.push(`/chat/${conversation.id}` as never)}
      className="flex-row items-center p-4 bg-surface dark:bg-surface-dark rounded-xl mb-2"
    >
      <Avatar name="Lily" size="md" />
      <View className="flex-1 ml-3">
        <Text
          className="text-base text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text className="text-xs text-text-muted dark:text-slate-400 mt-0.5">
          {lastAtLabel}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
    </Pressable>
  )
}

const SkeletonRow = () => (
  <View className="flex-row items-center p-4 bg-surface dark:bg-surface-dark rounded-xl mb-2">
    <SkeletonCircle size={40} />
    <View className="flex-1 ml-3">
      <SkeletonBox width="60%" height={16} rounded="sm" />
      <View className="mt-1.5">
        <SkeletonBox width={70} height={12} rounded="sm" />
      </View>
    </View>
  </View>
)

export function ConversationsListScreen() {
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()
  const { isLoading, data } = useConversations()
  const createConversation = useCreateConversation()

  const conversations: Conversation[] = pipe(
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
  )

  const isInitialLoading = isLoading && !data
  const showSkeleton = useDelayedLoading(isInitialLoading)

  const handleNewChat = useCallback(async () => {
    const result = await createConversation.mutateAsync({
      payload: { kind: 'general' },
    })
    Either.match(result, {
      onLeft: () => undefined,
      onRight: (created) => router.push(`/chat/${created.id}` as never),
    })
  }, [createConversation])

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationRow conversation={item} />
    ),
    []
  )

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-slate-700">
        <Text
          className="text-2xl text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
        >
          Ask Lily
        </Text>
        <Pressable
          testID="new-conversation-button"
          onPress={handleNewChat}
          className="w-10 h-10 items-center justify-center rounded-full bg-primary-tint dark:bg-primary/20"
        >
          <MaterialIcons name="add" size={22} color={iconColors.primary} />
        </Pressable>
      </View>

      {showSkeleton ? (
        <Animated.View
          entering={FadeIn.duration(300)}
          className="flex-1 px-4 pt-4"
        >
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </Animated.View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-base text-text-muted dark:text-slate-400 text-center px-8">
                Start your first conversation with Lily — ask anything about
                plant care, identification, or share a photo for help.
              </Text>
              <Pressable
                onPress={handleNewChat}
                className="mt-6 px-6 py-3 rounded-full bg-primary"
              >
                <Text
                  className="text-white"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                >
                  Start a chat
                </Text>
              </Pressable>
            </View>
          }
        />
      )}
    </View>
  )
}
