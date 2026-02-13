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
import { ActivityIndicator, Text, View } from 'react-native'
import { AnimatedImage } from 'src/components/AnimatedImage'
import { Avatar } from 'src/components/Avatar'
import { MarkdownText } from 'src/components/MarkdownText'
import { useIconColors } from 'src/hooks/useIconColors'
import { DiagnosisCard } from 'src/screens/chat/components/DiagnosisCard'

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
  const iconColors = useIconColors()
  const { t } = useTranslation('chat')

  // Bubble parts: text + files + tool loading states
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
              const displayText =
                p.text === QUOTA_EXCEEDED_KEY ? t('quotaExceeded') : p.text
              return Option.some(
                <View key={`text-${index}`}>
                  {isUser ? (
                    <Text className="text-md text-text-primary dark:text-white leading-relaxed font-regular">
                      {displayText}
                    </Text>
                  ) : (
                    <MarkdownText textClassName="text-md text-text-primary dark:text-white leading-relaxed font-regular">
                      {displayText}
                    </MarkdownText>
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
              if (toolName !== 'createDiagnosis') return Option.none()
              // Only loading states in the bubble; completed cards go full-width
              return pipe(
                Match.value(p.state),
                Match.when(
                  'input-streaming',
                  (): Option.Option<ReactElement> =>
                    Option.some(
                      <View
                        key={`loading-${index}`}
                        className="flex-row items-center py-2"
                      >
                        <ActivityIndicator
                          size="small"
                          color={iconColors.primary}
                        />
                        <Text className="text-sm text-text-muted dark:text-slate-400 ml-2 font-regular">
                          {t('analyzing')}
                        </Text>
                      </View>
                    )
                ),
                Match.when(
                  'input-available',
                  (): Option.Option<ReactElement> =>
                    Option.some(
                      <View
                        key={`loading-${index}`}
                        className="flex-row items-center py-2"
                      >
                        <ActivityIndicator
                          size="small"
                          color={iconColors.primary}
                        />
                        <Text className="text-sm text-text-muted dark:text-slate-400 ml-2 font-regular">
                          {t('analyzing')}
                        </Text>
                      </View>
                    )
                ),
                Match.orElse((): Option.Option<ReactElement> => Option.none())
              )
            }
          ),
          Match.orElse((): Option.Option<ReactElement> => Option.none())
        )
    )
  )

  // Full-width parts: completed diagnosis cards rendered outside the bubble
  const fullWidthParts = pipe(
    message.parts,
    Array.filterMap((part, index): Option.Option<ReactElement> => {
      if (!isToolUIPart(part)) return Option.none()
      const toolName = getToolName(part)
      if (toolName !== 'createDiagnosis') return Option.none()
      if (part.state !== 'output-available') return Option.none()
      return Option.some(
        <DiagnosisCard
          key={`diagnosis-${index}`}
          diagnosis={{
            ...(part.input as {
              diseaseName: string
              severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'
              confidence: number
              symptoms: string[]
              treatmentSteps: string[]
              preventionTips?: string[]
            }),
            diagnosisId: (part.output as { diagnosisId: string }).diagnosisId,
          }}
          plantId={plantId}
        />
      )
    })
  )

  const hasBubbleParts = Array.isNonEmptyReadonlyArray(bubbleParts)
  const hasFullWidthParts = Array.isNonEmptyReadonlyArray(fullWidthParts)

  return (
    <View className="mb-4">
      {/* Bubble row (text + files + loading states) */}
      {hasBubbleParts && (
        <View
          className={`flex-row items-end ${isUser ? 'justify-end' : 'justify-start'}`}
        >
          {!isUser && (
            <View className="mr-3 mb-5">
              <Avatar name="Lily" size="sm" />
            </View>
          )}
          <View
            className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}
          >
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
        </View>
      )}

      {/* Full-width diagnosis card(s) outside the bubble */}
      {hasFullWidthParts && (
        <View className={hasBubbleParts ? 'mt-2' : ''}>
          {!hasBubbleParts && !isUser && (
            <View className="mb-2">
              <Avatar name="Lily" size="sm" />
            </View>
          )}
          {fullWidthParts}
        </View>
      )}

      {/* Timestamp */}
      {createdAt && (
        <Text
          className={`text-xs mt-1 font-regular text-text-muted dark:text-slate-400 ${isUser ? 'text-right mr-1' : 'ml-1'}`}
        >
          {formatApiTime(createdAt)}
        </Text>
      )}
    </View>
  )
}
