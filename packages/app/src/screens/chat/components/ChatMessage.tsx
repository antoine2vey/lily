import { formatApiTime } from '@lily/shared'
import {
  type DynamicToolUIPart,
  getToolName,
  isToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from 'ai'
import { Array, Match, Option, pipe } from 'effect'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { AnimatedImage } from 'src/components/AnimatedImage'
import { Avatar } from 'src/components/Avatar'
import { MarkdownText } from 'src/components/MarkdownText'
import { useAuth } from 'src/contexts/AuthContext'

import { toolBubbleRenderers, toolFullWidthRenderers } from './tool-renderers'

const QUOTA_EXCEEDED_KEY = '__QUOTA_EXCEEDED__'

type Part = UIMessage['parts'][number]
type TextPart = Extract<Part, { type: 'text' }>
type FilePart = Extract<Part, { type: 'file' }>
type AnyToolPart = ToolUIPart | DynamicToolUIPart

interface ChatMessageProps {
  message: UIMessage
  plantId?: string
  createdAt?: string
}

export function ChatMessage({ message, plantId, createdAt }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const { t } = useTranslation('chat')
  const { state } = useAuth()

  const userName = pipe(
    Match.value(state),
    Match.when({ _tag: 'Authenticated' }, (s) =>
      Option.getOrElse(Option.fromNullable(s.user.username), () => 'You')
    ),
    Match.orElse(() => 'You')
  )

  // Check if this message has a completed diagnosis tool
  const hasCompletedDiagnosis = Array.some(
    message.parts,
    (p) =>
      isToolUIPart(p) &&
      getToolName(p) === 'createDiagnosis' &&
      p.state === 'output-available'
  )

  // Bubble parts: text + files + tool loading states
  // When a completed diagnosis exists, text moves to the full-width section
  const bubbleParts = pipe(
    message.parts,
    Array.filterMap(
      (part, index): Option.Option<ReactElement> =>
        pipe(
          Match.value(part),
          Match.when(
            { type: 'text' },
            (p: TextPart): Option.Option<ReactElement> => {
              if (p.text === '') return Option.none()
              // When diagnosis is complete, text renders in full-width section
              if (hasCompletedDiagnosis) return Option.none()
              const displayText =
                p.text === QUOTA_EXCEEDED_KEY ? t('quotaExceeded') : p.text
              return Option.some(
                <View key={`text-${index}`}>
                  {isUser ? (
                    <Text className="text-md text-text-primary dark:text-white leading-relaxed font-regular">
                      {displayText}
                    </Text>
                  ) : (
                    <MarkdownText>{displayText}</MarkdownText>
                  )}
                </View>
              )
            }
          ),
          Match.when(
            { type: 'file' },
            (p: FilePart): Option.Option<ReactElement> => {
              if (p.mediaType.startsWith('image/')) {
                return Option.some(
                  <View
                    key={`file-${index}`}
                    className="mb-2 rounded-md overflow-hidden"
                  >
                    <AnimatedImage
                      source={{ uri: p.url }}
                      className="w-56 h-56 rounded-md"
                      contentFit="cover"
                    />
                  </View>
                )
              }
              return Option.none()
            }
          ),
          Match.when(
            (p: Part): p is AnyToolPart => isToolUIPart(p),
            (p: AnyToolPart): Option.Option<ReactElement> => {
              const toolName = getToolName(p)
              return pipe(
                Option.fromNullable(toolBubbleRenderers[toolName]),
                Option.flatMap((renderer) => renderer(p, index, t))
              )
            }
          ),
          Match.orElse((): Option.Option<ReactElement> => Option.none())
        )
    )
  )

  // Text bubble rendered above diagnosis cards when tool is complete
  const diagnosisTextBubble: ReactElement | null = pipe(
    hasCompletedDiagnosis,
    Match.value,
    Match.when(true, (): ReactElement | null => {
      const texts = pipe(
        message.parts,
        Array.filterMap(
          (part, index): Option.Option<ReactElement> =>
            pipe(
              Match.value(part),
              Match.when(
                { type: 'text' },
                (p: TextPart): Option.Option<ReactElement> => {
                  if (p.text === '') return Option.none()
                  return Option.some(
                    <View key={`diag-text-${index}`}>
                      <MarkdownText>{p.text}</MarkdownText>
                    </View>
                  )
                }
              ),
              Match.orElse((): Option.Option<ReactElement> => Option.none())
            )
        )
      )
      if (!Array.isNonEmptyReadonlyArray(texts)) return null
      return (
        <View className="flex-row items-start justify-start mb-2">
          <View className="mr-3 mt-3">
            <Avatar name="Lily" size="sm" />
          </View>
          <View className="flex-1 items-start">
            <View
              className="px-4 py-3 rounded-md bg-primary-tint dark:bg-primary/20"
              style={{ borderBottomLeftRadius: 4, borderBottomRightRadius: 16 }}
            >
              {texts}
            </View>
          </View>
        </View>
      )
    }),
    Match.orElse((): ReactElement | null => null)
  )

  // Full-width parts: completed tool output rendered outside the bubble
  const fullWidthParts = pipe(
    message.parts,
    Array.filterMap((part, index): Option.Option<ReactElement> => {
      if (!isToolUIPart(part)) return Option.none()
      const toolName = getToolName(part)
      return pipe(
        Option.fromNullable(toolFullWidthRenderers[toolName]),
        Option.flatMap((renderer) => renderer(part, index, plantId))
      )
    })
  )

  const hasBubbleParts = Array.isNonEmptyReadonlyArray(bubbleParts)
  const hasFullWidthParts = Array.isNonEmptyReadonlyArray(fullWidthParts)
  const hasDiagnosisContent = diagnosisTextBubble !== null || hasFullWidthParts

  return (
    <View className="mb-4">
      {/* Bubble row (text + files + loading states) */}
      {hasBubbleParts && (
        <View
          className={`flex-row items-start ${isUser ? 'justify-end' : 'justify-start'}`}
        >
          {!isUser && (
            <View className="mr-3 mt-3">
              <Avatar name="Lily" size="sm" />
            </View>
          )}
          <View className={`flex-1 ${isUser ? 'items-end' : 'items-start'}`}>
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
              {bubbleParts}
            </View>
          </View>
          {isUser && (
            <View className="ml-3 mt-3">
              <Avatar name={userName} size="sm" />
            </View>
          )}
        </View>
      )}

      {/* Diagnosis text bubble + full-width tool cards */}
      {hasDiagnosisContent && (
        <View className={hasBubbleParts ? 'mt-2' : ''}>
          {diagnosisTextBubble}
          {fullWidthParts}
        </View>
      )}

      {/* Timestamp */}
      {createdAt && (
        <Text
          className={`text-xs mt-1 font-regular text-text-muted dark:text-slate-400 ${isUser ? 'text-right mr-12' : 'ml-12'}`}
        >
          {formatApiTime(createdAt)}
        </Text>
      )}
    </View>
  )
}
