import { nowAsIsoString } from '@lily/shared'
import { useQueryClient } from '@tanstack/react-query'
import type { UIMessage } from 'ai'
import { Array, Option, pipe } from 'effect'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useRef } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useChatHistory } from 'src/hooks/useChatHistory'
import { useIconColors } from 'src/hooks/useIconColors'
import { usePlantChat } from 'src/hooks/usePlantChat'
import { useUploadChatImage } from 'src/hooks/useUploadChatImage'
import { ChatHeader } from 'src/screens/chat/components/ChatHeader'
import { ChatInput } from 'src/screens/chat/components/ChatInput'
import { ChatMessage } from 'src/screens/chat/components/ChatMessage'
import { SuggestionChips } from 'src/screens/chat/components/SuggestionChips'
import { TypingIndicator } from 'src/screens/chat/components/TypingIndicator'

export function ChatScreen() {
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()
  const { plantId } = useLocalSearchParams<{ plantId: string }>()
  const flatListRef = useRef<FlatList<UIMessage>>(null)
  const queryClient = useQueryClient()

  // Load chat history from server for initialMessages
  const { isLoading: isLoadingHistory, initialMessages } =
    useChatHistory(plantId)

  // Use AI SDK's useChat hook with initialMessages
  const {
    messages: chatMessages,
    sendMessage,
    status,
    pendingImageUrl,
  } = usePlantChat({
    plantId: Option.getOrElse(Option.fromNullable(plantId), () => ''),
    initialMessages,
  })

  // Image upload mutation
  const uploadImage = useUploadChatImage(
    Option.getOrElse(Option.fromNullable(plantId), () => '')
  )

  // Derive loading states from status
  const isStreaming = status === 'submitted' || status === 'streaming'

  // Use UIMessage directly, reversed for inverted FlatList.
  // Filter out the empty assistant placeholder that appears while streaming.
  const displayMessages: UIMessage[] = pipe(
    chatMessages,
    Array.filter((msg: UIMessage) => {
      if (
        isStreaming &&
        msg.role === 'assistant' &&
        pipe(
          msg.parts,
          Array.filter(
            (p): p is Extract<UIMessage['parts'][number], { type: 'text' }> =>
              p.type === 'text'
          ),
          Array.every((p) => p.text === '')
        )
      ) {
        return false
      }
      return true
    }),
    Array.reverse
  )

  const handleSend = useCallback(
    async (content: string, imageUri?: string) => {
      if (!plantId || isStreaming) return

      // If image is attached, upload first then set pendingImageUrl
      if (imageUri) {
        try {
          const result = await uploadImage.mutateAsync(imageUri)
          pendingImageUrl.current = result.imageUrl
        } catch {
          // Upload failed, send without image
        }
      }

      // Build file parts for local display of uploaded image
      const files = pendingImageUrl.current
        ? [
            {
              type: 'file' as const,
              mediaType: 'image/jpeg',
              url: pendingImageUrl.current,
            },
          ]
        : undefined

      // Use sendMessage to add user message and trigger streaming response
      await sendMessage({
        text: content,
        ...(files ? { files } : {}),
      })

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

  // Show typing indicator when:
  // 1. Status is 'submitted' (waiting for AI response to start)
  // 2. Status is 'streaming' but assistant message has no content yet
  const showTypingIndicator = pipe(
    Array.last(chatMessages),
    Option.match({
      onNone: () => status === 'submitted',
      onSome: (msg: UIMessage) =>
        status === 'submitted' ||
        (status === 'streaming' &&
          msg.role === 'assistant' &&
          pipe(
            msg.parts,
            Array.filter(
              (p): p is Extract<UIMessage['parts'][number], { type: 'text' }> =>
                p.type === 'text'
            ),
            Array.every((p) => p.text === '')
          )),
    })
  )

  const renderListHeader = useCallback(() => {
    if (showTypingIndicator) {
      return <TypingIndicator />
    }
    return null
  }, [showTypingIndicator])

  if (isLoadingHistory) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top }}
      >
        <ChatHeader />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={iconColors.primary} />
        </View>
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

        <ChatInput
          onSend={handleSend}
          disabled={isStreaming || uploadImage.isPending}
        />
      </KeyboardAvoidingView>
    </View>
  )
}
