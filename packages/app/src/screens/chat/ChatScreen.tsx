import { nowAsIsoString } from '@lily/shared'
import { useQueryClient } from '@tanstack/react-query'
import { isToolUIPart, type UIMessage } from 'ai'
import { Array, Either, Option, pipe } from 'effect'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SkeletonBox } from '@/components/skeletons'
import { useConversationChat } from '@/hooks/useConversationChat'
import { useConversationMessages } from '@/hooks/useConversationMessages'
import { useCreateConversation } from '@/hooks/useCreateConversation'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useUploadConversationImage } from '@/hooks/useUploadConversationImage'
import { AskLilyHeader } from '@/screens/chat/components/AskLilyHeader'
import { ChatInput } from '@/screens/chat/components/ChatInput'
import { ChatMessage } from '@/screens/chat/components/ChatMessage'
import { ConversationsDrawer } from '@/screens/chat/components/ConversationsDrawer'
import { TypingIndicator } from '@/screens/chat/components/TypingIndicator'

function hasNoVisibleContent(msg: UIMessage): boolean {
  const hasText = Array.some(
    msg.parts,
    (p) => p.type === 'text' && p.text !== ''
  )
  const hasActiveToolLoading = Array.some(
    msg.parts,
    (p) =>
      isToolUIPart(p) &&
      (p.state === 'input-streaming' || p.state === 'input-available')
  )
  return !hasText && !hasActiveToolLoading
}

export function ChatScreen() {
  const insets = useSafeAreaInsets()
  const { conversationId: paramId } = useLocalSearchParams<{
    conversationId?: string
  }>()
  const flatListRef = useRef<FlatList<UIMessage>>(null)
  const queryClient = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const createConversation = useCreateConversation()

  const [activeConversationId, setActiveConversationId] = useState<
    string | undefined
  >(paramId)
  const [pendingMessage, setPendingMessage] = useState<{
    content: string
    imageUri?: string | undefined
  } | null>(null)

  useEffect(() => {
    setActiveConversationId(paramId)
  }, [paramId])

  const {
    isLoading: isLoadingHistory,
    initialMessages,
    error: historyError,
    refetch: _refetchHistory,
  } = useConversationMessages(activeConversationId)
  const refetchHistory = _refetchHistory as () => void

  const {
    messages: chatMessages,
    sendMessage,
    status,
    error: chatError,
    pendingImageUrl,
  } = useConversationChat({
    conversationId: activeConversationId ?? '',
    initialMessages,
  })

  const uploadImage = useUploadConversationImage(activeConversationId ?? '')
  const isStreaming = status === 'submitted' || status === 'streaming'

  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const selectConversation = useCallback(
    (id: string) => setActiveConversationId(id),
    []
  )
  const resetConversation = useCallback(
    () => setActiveConversationId(undefined),
    []
  )

  const displayMessages: UIMessage[] = pipe(
    chatMessages,
    Array.filter(
      (msg: UIMessage) =>
        !(isStreaming && msg.role === 'assistant' && hasNoVisibleContent(msg))
    ),
    Array.reverse
  )

  const sendInternal = useCallback(
    async (content: string, imageUri?: string) => {
      if (isStreaming) return

      let uploadedImageKey: string | undefined
      let uploadedImageUrl: string | undefined

      if (imageUri) {
        try {
          const result = await uploadImage.mutateAsync(imageUri)
          uploadedImageUrl = result.imageUrl
          uploadedImageKey = result.imageKey
          pendingImageUrl.current = uploadedImageUrl
        } catch {
          // Upload failed, send without image
        }
      }

      const imageOption = Option.fromNullable(uploadedImageUrl)
      const messagePayload = pipe(
        imageOption,
        Option.match({
          onNone: () => ({ text: content }),
          onSome: (url) => ({
            text: content,
            files: [{ type: 'file' as const, mediaType: 'image/jpeg', url }],
          }),
        })
      )

      const bodyOption = pipe(
        Option.fromNullable(uploadedImageKey),
        Option.map((key) => ({ imageKey: key }))
      )

      await sendMessage(
        messagePayload,
        pipe(
          bodyOption,
          Option.match({
            onNone: () => ({}),
            onSome: (body) => ({ body }),
          })
        )
      )

      pendingImageUrl.current = undefined

      // Refresh both this conversation's history and the conversations list
      // (so the row's "lastMessageAt" is fresh).
      queryClient.invalidateQueries({
        queryKey: ['aiChat', 'getConversationMessages'],
      })
      queryClient.invalidateQueries({
        queryKey: ['aiChat', 'listConversations'],
      })
    },
    [isStreaming, sendMessage, queryClient, uploadImage, pendingImageUrl]
  )

  const handleSend = useCallback(
    async (content: string, imageUri?: string) => {
      if (activeConversationId) {
        await sendInternal(content, imageUri)
        return
      }
      // No conversation yet — create one lazily, then queue the message to be
      // sent once the chat hooks have re-initialized with the new id.
      const result = await createConversation.mutateAsync({
        payload: { kind: 'general' },
      })
      Either.match(result, {
        onLeft: () => undefined,
        onRight: (created) => {
          setActiveConversationId(created.id)
          setPendingMessage({ content, imageUri })
        },
      })
    },
    [activeConversationId, sendInternal, createConversation]
  )

  // The chat hook's transport URL captures conversationId at init, so the
  // first message has to wait for the hook to re-bind to the just-created id.
  useEffect(() => {
    if (!activeConversationId || !pendingMessage) return
    const msg = pendingMessage
    setPendingMessage(null)
    sendInternal(msg.content, msg.imageUri)
  }, [activeConversationId, pendingMessage, sendInternal])

  const renderMessage = useCallback(({ item }: { item: UIMessage }) => {
    const metadata = item.metadata as { createdAt?: string } | undefined
    return (
      <ChatMessage
        message={item}
        createdAt={pipe(
          Option.fromNullable(metadata?.createdAt),
          Option.getOrElse(() => nowAsIsoString())
        )}
      />
    )
  }, [])

  const showTypingIndicator = pipe(
    Array.last(chatMessages),
    Option.match({
      onNone: () => status === 'submitted',
      onSome: (msg: UIMessage) =>
        status === 'submitted' ||
        (status === 'streaming' &&
          msg.role === 'assistant' &&
          hasNoVisibleContent(msg)),
    })
  )

  const renderListHeader = useCallback(() => {
    if (showTypingIndicator) {
      return <TypingIndicator />
    }
    return null
  }, [showTypingIndicator])

  const isInitialLoading = isLoadingHistory && !initialMessages
  const showSkeleton = useDelayedLoading(isInitialLoading)

  if (historyError) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top }}
      >
        <AskLilyHeader onMenuPress={openDrawer} />
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-lg text-center font-semibold text-text-primary dark:text-white">
            Failed to load chat
          </Text>
          <Pressable
            onPress={() => refetchHistory()}
            className="mt-6 px-6 py-3 rounded-full bg-primary"
          >
            <Text className="font-semibold text-white">Try Again</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (showSkeleton) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top }}
      >
        <AskLilyHeader onMenuPress={openDrawer} />
        <Animated.View
          entering={FadeIn.duration(300)}
          className="flex-1 p-4 gap-4"
        >
          <View className="self-start">
            <SkeletonBox width={220} height={60} rounded="lg" />
          </View>
          <View className="self-end">
            <SkeletonBox width={180} height={40} rounded="lg" />
          </View>
        </Animated.View>
      </View>
    )
  }

  if (isInitialLoading) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top }}
      >
        <AskLilyHeader onMenuPress={openDrawer} />
      </View>
    )
  }

  return (
    <View
      testID="chat-screen"
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      <AskLilyHeader onMenuPress={openDrawer} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={displayMessages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderListHeader}
        />

        {chatError && (
          <View className="mx-4 mb-2 rounded-md bg-error/10 px-4 py-3">
            <Text
              className="text-sm text-error"
              style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
            >
              Something went wrong. Please try again.
            </Text>
          </View>
        )}

        <ChatInput
          onSend={handleSend}
          disabled={isStreaming || uploadImage.isPending}
        />
      </KeyboardAvoidingView>

      <ConversationsDrawer
        visible={drawerOpen}
        onClose={closeDrawer}
        currentConversationId={activeConversationId}
        onSelectConversation={selectConversation}
        onNewChat={resetConversation}
      />
    </View>
  )
}
