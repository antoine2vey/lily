import {
  type DynamicToolUIPart,
  getToolName,
  isToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from 'ai'
import { Array, Match, Option, pipe, String } from 'effect'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { AnimatedImage } from '@/components/AnimatedImage'
import { MarkdownText } from '@/components/MarkdownText'
import { messageEntering } from '@/screens/chat/components/chat-motion'
import {
  toolBubbleRenderers,
  toolFullWidthRenderers,
} from '@/screens/chat/components/tool-renderers'

const QUOTA_EXCEEDED_KEY = '__QUOTA_EXCEEDED__'

export const USER_BUBBLE_CLASSES =
  'max-w-[82%] rounded-xl px-4 bg-primary-tint dark:bg-white/10'

type Part = UIMessage['parts'][number]
type TextPart = Extract<Part, { type: 'text' }>
type FilePart = Extract<Part, { type: 'file' }>
type AnyToolPart = ToolUIPart | DynamicToolUIPart

interface ChatMessageProps {
  message: UIMessage
  plantId?: string | undefined
  autoOpenToolId?: string | null | undefined
  onAutoOpenHandled?: (() => void) | undefined
  arrivedInSession?: boolean | undefined
}

export function ChatMessage({
  message,
  plantId,
  autoOpenToolId,
  onAutoOpenHandled,
  arrivedInSession = false,
}: ChatMessageProps) {
  const isUser = message.role === 'user'
  const { t } = useTranslation('chat')

  const hasText = Array.some(
    message.parts,
    (p) => p.type === 'text' && p.text !== ''
  )

  const inlineParts = pipe(
    message.parts,
    Array.map(
      (part, index): Option.Option<ReactElement> =>
        pipe(
          Match.value(part),
          Match.when(
            { type: 'text' },
            (p: TextPart): Option.Option<ReactElement> => {
              if (p.text === '') return Option.none()
              const displayText =
                p.text === QUOTA_EXCEEDED_KEY ? t('quotaExceeded') : p.text
              return Option.some(
                isUser ? (
                  <View
                    // biome-ignore lint/suspicious/noArrayIndexKey: message parts carry no id and only ever append, so the index is stable
                    key={`text-${index}`}
                    className={`${USER_BUBBLE_CLASSES} py-2.5`}
                  >
                    <Text className="text-base leading-6 font-regular text-text-primary dark:text-white">
                      {displayText}
                    </Text>
                  </View>
                ) : (
                  <MarkdownText
                    // biome-ignore lint/suspicious/noArrayIndexKey: message parts carry no id and only ever append, so the index is stable
                    key={`text-${index}`}
                  >
                    {displayText}
                  </MarkdownText>
                )
              )
            }
          ),
          Match.when(
            { type: 'file' },
            (p: FilePart): Option.Option<ReactElement> =>
              pipe(p.mediaType, String.startsWith('image/'))
                ? Option.some(
                    <AnimatedImage
                      // biome-ignore lint/suspicious/noArrayIndexKey: message parts carry no id and only ever append, so the index is stable
                      key={`file-${index}`}
                      source={{ uri: p.url }}
                      className={`w-56 h-56 rounded-xl ${hasText ? 'mb-2' : ''}`}
                      contentFit="cover"
                    />
                  )
                : Option.none()
          ),
          Match.when(
            (p: Part): p is AnyToolPart => isToolUIPart(p),
            (p: AnyToolPart): Option.Option<ReactElement> =>
              pipe(
                Option.fromNullishOr(toolBubbleRenderers[getToolName(p)]),
                Option.flatMap((renderer) => renderer(p, index, t))
              )
          ),
          Match.orElse((): Option.Option<ReactElement> => Option.none())
        )
    ),
    Array.getSomes
  )

  const fullWidthParts = pipe(
    message.parts,
    Array.map((part, index): Option.Option<ReactElement> => {
      if (!isToolUIPart(part)) return Option.none()
      return pipe(
        Option.fromNullishOr(toolFullWidthRenderers[getToolName(part)]),
        Option.flatMap((renderer) =>
          renderer(part, index, {
            t,
            plantId,
            autoOpenToolId,
            onAutoOpenHandled,
            arrivedInSession,
          })
        )
      )
    }),
    Array.getSomes
  )

  const hasInlineParts = Array.isReadonlyArrayNonEmpty(inlineParts)

  return (
    <Animated.View
      className="mb-6"
      {...(arrivedInSession ? { entering: messageEntering } : {})}
    >
      {hasInlineParts && (
        <View className={isUser ? 'items-end' : ''}>{inlineParts}</View>
      )}
      {Array.isReadonlyArrayNonEmpty(fullWidthParts) && (
        <View className={hasInlineParts ? 'mt-3' : ''}>{fullWidthParts}</View>
      )}
    </Animated.View>
  )
}
