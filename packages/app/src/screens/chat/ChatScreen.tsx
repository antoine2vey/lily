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
import { SkeletonBox } from 'src/components/skeletons'
import { useChatHistory } from 'src/hooks/useChatHistory'
import { useDelayedLoading } from 'src/hooks/useDelayedLoading'
import { useIconColors } from 'src/hooks/useIconColors'
import { usePlantChat } from 'src/hooks/usePlantChat'
import { useUploadChatImage } from 'src/hooks/useUploadChatImage'
import { ChatHeader } from 'src/screens/chat/components/ChatHeader'
import { ChatInput } from 'src/screens/chat/components/ChatInput'
import { ChatMessage } from 'src/screens/chat/components/ChatMessage'
import { SuggestionChips } from 'src/screens/chat/components/SuggestionChips'
import { TypingIndicator } from 'src/screens/chat/components/TypingIndicator'

/**
 * Returns true when an assistant message has no visible content yet —
 * either only empty text parts, or completed tool parts with no text.
 * Returns false if any non-empty text exists or a tool is still loading
 * (since the tool loading indicator provides visible feedback).
 */
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
  const _iconColors = useIconColors()
  const { plantId } = useLocalSearchParams<{ plantId: string }>()
  const flatListRef = useRef<FlatList<UIMessage>>(null)
  const queryClient = useQueryClient()

  const safePlantId = Option.getOrElse(Option.fromNullable(plantId), () => '')

  // Load chat history from server for initialMessages
  const {
    isLoading: isLoadingHistory,
    initialMessages,
    error: historyError,
    refetch: _refetchHistory,
  } = useChatHistory(plantId)
  const refetchHistory = _refetchHistory as () => void

  // Use AI SDK's useChat hook with initialMessages
  const {
    messages: chatMessages,
    sendMessage,
    status,
    error: chatError,
    pendingImageUrl,
  } = usePlantChat({
    plantId: safePlantId,
    initialMessages,
  })

  // Image upload mutation
  const uploadImage = useUploadChatImage(safePlantId)

  // Derive loading states from status
  const isStreaming = status === 'submitted' || status === 'streaming'

  // Reversed for inverted FlatList, filtering out the empty assistant
  // placeholder that appears before streaming content arrives.
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
      if (!plantId || isStreaming) return

      let uploadedImageKey: string | undefined
      let uploadedImageUrl: string | undefined

      // If image is attached, upload first
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

      // Build message payload with optional file parts for local display
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

      // Pass imageKey through sendMessage body option so it reaches
      // prepareSendMessagesRequest without relying on refs
      const body = pipe(
        Option.fromNullable(uploadedImageKey),
        Option.match({
          onNone: () => undefined,
          onSome: (key) => ({ imageKey: key }),
        })
      )

      await sendMessage(messagePayload, { body })

      pendingImageUrl.current = undefined

      // Invalidate history after sending to sync with server
      queryClient.invalidateQueries({
        queryKey: ['aiChat', 'getChatHistory'],
      })
    },
    [
      plantId,
      isStreaming,
      sendMessage,
      queryClient,
      uploadImage,
      pendingImageUrl,
    ]
  )

  const handleSuggestionSelect = useCallback(
    (suggestion: string) => {
      handleSend(suggestion)
    },
    [handleSend]
  )

  const renderMessage = useCallback(
    ({ item }: { item: UIMessage }) => {
      const metadata = item.metadata as { createdAt?: string } | undefined
      return (
        <ChatMessage
          message={item}
          plantId={plantId}
          createdAt={pipe(
            Option.fromNullable(metadata?.createdAt),
            Option.getOrElse(() => nowAsIsoString())
          )}
        />
      )
    },
    [plantId]
  )

  // Show typing indicator when waiting for AI response to start,
  // or streaming but the assistant message has no content yet.
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
        <ChatHeader />
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
        <ChatHeader />
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
          <View className="self-start">
            <SkeletonBox width={260} height={80} rounded="lg" />
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
        <ChatHeader />
      </View>
    )
  }

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      <ChatHeader />

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

        {Array.isEmptyReadonlyArray(displayMessages) && !isStreaming && (
          <SuggestionChips
            onSelect={handleSuggestionSelect}
            plantId={plantId}
          />
        )}

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
