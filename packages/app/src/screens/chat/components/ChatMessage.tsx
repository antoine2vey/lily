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
      className={`flex-row mb-4 items-end ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <View className="mr-3 mb-5">
          <Avatar name="Lily" size="sm" />
        </View>
      )}
      <View className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <View
          className={`px-4 py-3 rounded-md ${
            isUser
              ? 'bg-surface dark:bg-surface-dark border border-border dark:border-slate-700'
              : 'bg-primary-tint dark:bg-primary/20'
          }`}
          style={{
            borderBottomLeftRadius: isUser ? 16 : 4,
            borderBottomRightRadius: isUser ? 4 : 16,
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
            <Text className="text-md text-text-primary dark:text-white leading-relaxed font-regular">
              {message.content}
            </Text>
          ) : (
            <MarkdownText textClassName="text-md text-text-primary dark:text-white leading-relaxed font-regular">
              {message.content}
            </MarkdownText>
          )}
        </View>
        <Text
          className={`text-xs mt-1 font-regular text-text-muted dark:text-slate-400 ${isUser ? 'mr-1' : 'ml-1'}`}
        >
          {formatApiTime(message.createdAt)}
        </Text>
      </View>
    </View>
  )
}
