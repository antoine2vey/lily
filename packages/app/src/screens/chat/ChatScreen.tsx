import { nowAsIsoString } from '@lily/shared'
import { useQueryClient } from '@tanstack/react-query'
import { isToolUIPart, type UIMessage } from 'ai'
import { Array, Option, pipe } from 'effect'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useRef } from 'react'
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
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useUploadConversationImage } from '@/hooks/useUploadConversationImage'
import { AskLilyHeader } from '@/screens/chat/components/AskLilyHeader'
import { ChatInput } from '@/screens/chat/components/ChatInput'
import { ChatMessage } from '@/screens/chat/components/ChatMessage'
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
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>()
  const flatListRef = useRef<FlatList<UIMessage>>(null)
  const queryClient = useQueryClient()

  const safeId = Option.getOrElse(Option.fromNullable(conversationId), () => '')

  const {
    isLoading: isLoadingHistory,
    initialMessages,
    error: historyError,
    refetch: _refetchHistory,
  } = useConversationMessages(safeId)
  const refetchHistory = _refetchHistory as () => void

  const {
    messages: chatMessages,
    sendMessage,
    status,
    error: chatError,
    pendingImageUrl,
  } = useConversationChat({
    conversationId: safeId,
    initialMessages,
  })

  const uploadImage = useUploadConversationImage(safeId)
  const isStreaming = status === 'submitted' || status === 'streaming'

  const displayMessages: UIMessage[] = pipe(
    chatMessages,
    Array.filter(
      (msg: UIMessage) =>
        !(isStreaming && msg.role === 'assistant' && hasNoVisibleContent(msg))
    ),
    Array.reverse
  )

  const handleSend = useCallback(
    async (content: string, imageUri?: string) => {
      if (!conversationId || isStreaming) return

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
    [
      conversationId,
      isStreaming,
      sendMessage,
      queryClient,
      uploadImage,
      pendingImageUrl,
    ]
  )

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
        <AskLilyHeader />
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
        <AskLilyHeader />
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
        <AskLilyHeader />
      </View>
    )
  }

  return (
    <View
      testID="chat-screen"
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      <AskLilyHeader />

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
    </View>
  )
}
