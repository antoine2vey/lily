import { nowAsIsoString } from '@lily/shared'
import { useQueryClient } from '@tanstack/react-query'
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
import { SafeAreaView } from 'react-native-safe-area-context'
import { useChatHistory } from 'src/hooks/useChatHistory'
import { useIconColors } from 'src/hooks/useIconColors'
import { usePlantChat } from 'src/hooks/usePlantChat'
import { ChatHeader } from './components/ChatHeader'
import { ChatInput } from './components/ChatInput'
import { ChatMessage } from './components/ChatMessage'
import { SuggestionChips } from './components/SuggestionChips'
import { TypingIndicator } from './components/TypingIndicator'

interface ChatMessageData {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string
  createdAt: string
}

export function ChatScreen() {
  const iconColors = useIconColors()
  const { plantId } = useLocalSearchParams<{ plantId: string }>()
  const flatListRef = useRef<FlatList<ChatMessageData>>(null)
  const queryClient = useQueryClient()

  // Load chat history from server for initialMessages
  const { isLoading: isLoadingHistory, initialMessages } =
    useChatHistory(plantId)

  // Use AI SDK's useChat hook with initialMessages
  const {
    messages: chatMessages,
    append,
    status,
  } = usePlantChat({
    plantId: plantId ?? '',
    initialMessages,
  })

  // Derive loading states from status
  const isStreaming = status === 'submitted' || status === 'streaming'

  // Transform useChat messages to display format and reverse for inverted FlatList
  const displayMessages: ChatMessageData[] = pipe(
    chatMessages,
    Array.map((msg) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      createdAt:
        msg.createdAt instanceof Date
          ? msg.createdAt.toISOString()
          : nowAsIsoString(),
    })),
    Array.reverse
  )

  const handleSend = useCallback(
    async (content: string, _imageUri?: string) => {
      if (!plantId || isStreaming) return

      // Use append to add user message and trigger streaming response
      await append({
        role: 'user',
        content,
      })

      // Invalidate history after sending to sync with server
      queryClient.invalidateQueries({ queryKey: ['aiChat', 'getChatHistory'] })
    },
    [plantId, isStreaming, append, queryClient]
  )

  const handleSuggestionSelect = useCallback(
    (suggestion: string) => {
      handleSend(suggestion)
    },
    [handleSend]
  )

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessageData }) => <ChatMessage message={item} />,
    []
  )

  // Show typing indicator when:
  // 1. Status is 'submitted' (waiting for AI response to start)
  // 2. Status is 'streaming' but assistant message has no content yet
  const showTypingIndicator = pipe(
    Array.last(chatMessages),
    Option.match({
      onNone: () => status === 'submitted',
      onSome: (msg) =>
        status === 'submitted' ||
        (status === 'streaming' &&
          msg.role === 'assistant' &&
          msg.content === ''),
    })
  )

  const renderListHeader = useCallback(() => {
    // Show typing indicator only when streaming and assistant has no content yet
    if (showTypingIndicator) {
      return <TypingIndicator />
    }
    return null
  }, [showTypingIndicator])

  if (isLoadingHistory) {
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
        <ChatHeader />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={iconColors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={['top']}
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

        {displayMessages.length === 0 && !isStreaming && (
          <SuggestionChips
            onSelect={handleSuggestionSelect}
            plantId={plantId}
          />
        )}

        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
