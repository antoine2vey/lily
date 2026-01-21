import type { RouteProp } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native'
import { useRef } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useChatHistory } from 'src/hooks/useChatHistory'
import { useSendMessage } from 'src/hooks/useSendMessage'
import { iconColors } from 'src/theme'
import { ChatHeader } from './components/ChatHeader'
import { ChatInput } from './components/ChatInput'
import { ChatMessage } from './components/ChatMessage'
import { SuggestionChips } from './components/SuggestionChips'
import { TypingIndicator } from './components/TypingIndicator'

type RootStackParamList = {
  Chat: { plantId?: string }
}

type ChatScreenRouteProp = RouteProp<RootStackParamList, 'Chat'>

interface ChatMessageData {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string
  createdAt: string
}

export function ChatScreen() {
  const route = useRoute<ChatScreenRouteProp>()
  const plantId = route.params?.plantId
  const flatListRef = useRef<FlatList<ChatMessageData>>(null)

  const { data: messages, isLoading } = useChatHistory(plantId)
  const { mutate: sendMessage, isPending: isSending } = useSendMessage()

  const handleSend = (content: string, imageUri?: string) => {
    sendMessage({
      content,
      imageUri,
      plantId,
    })
  }

  const handleSuggestionSelect = (suggestion: string) => {
    handleSend(suggestion)
  }

  const renderMessage = ({ item }: { item: ChatMessageData }) => (
    <ChatMessage message={item} />
  )

  const renderListHeader = () => {
    if (isSending) {
      return <TypingIndicator />
    }
    return null
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <ChatHeader />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={iconColors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ChatHeader />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderListHeader}
        />

        {(!messages || messages.length === 0) && !isSending && (
          <SuggestionChips
            onSelect={handleSuggestionSelect}
            plantId={plantId}
          />
        )}

        <ChatInput onSend={handleSend} disabled={isSending} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
