import { formatApiTime } from '@lily/shared'
import { Image, Text, View } from 'react-native'
import { Avatar } from 'src/components/Avatar'
import { MarkdownText } from 'src/components/MarkdownText'

type MessageRole = 'user' | 'assistant'

interface ChatMessageData {
  id: string
  role: MessageRole
  content: string
  imageUrl?: string
  createdAt: string
}

interface ChatMessageProps {
  message: ChatMessageData
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <View
      className={`flex-row mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <View className="mr-2 mt-1">
          <Avatar name="Lily" size="sm" />
        </View>
      )}
      <View className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <View
          className={`px-4 py-3 rounded-2xl ${isUser ? 'bg-primary' : 'bg-primary-tint'}`}
          style={{
            borderTopLeftRadius: isUser ? 16 : 4,
            borderTopRightRadius: isUser ? 4 : 16,
          }}
        >
          {message.imageUrl && (
            <Image
              source={{ uri: message.imageUrl }}
              className="w-48 h-36 rounded-lg mb-2"
              resizeMode="cover"
            />
          )}
          {isUser ? (
            <Text
              className="text-base text-white"
              style={{ fontFamily: 'PlusJakartaSans_400Regular' }}
            >
              {message.content}
            </Text>
          ) : (
            <MarkdownText
              style={{
                fontFamily: 'PlusJakartaSans_400Regular',
                fontSize: 16,
                lineHeight: 24,
                color: '#1A1A1A',
              }}
            >
              {message.content}
            </MarkdownText>
          )}
        </View>
        <Text className="text-xs mt-1 font-regular text-text-muted">
          {formatApiTime(message.createdAt)}
        </Text>
      </View>
    </View>
  )
}
