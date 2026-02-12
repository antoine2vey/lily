import { formatApiTime } from '@lily/shared'
import type { UIMessage } from 'ai'
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
type DynamicToolPart = Extract<Part, { type: 'dynamic-tool' }>

interface ChatMessageProps {
  message: UIMessage
  plantId?: string
  createdAt?: string
}

export function ChatMessage({ message, plantId, createdAt }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const iconColors = useIconColors()
  const { t } = useTranslation('chat')

  const renderedParts = pipe(
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
            { type: 'dynamic-tool' },
            (p: DynamicToolPart): Option.Option<ReactElement> =>
              pipe(
                Match.value(p.state),
                Match.when(
                  'output-available',
                  (): Option.Option<ReactElement> => {
                    if (p.toolName === 'createDiagnosis') {
                      return Option.some(
                        <DiagnosisCard
                          key={`diagnosis-${index}`}
                          diagnosis={
                            p.output as {
                              diagnosisId: string
                              diseaseName: string
                              severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'
                              confidence: number
                              symptoms: string[]
                              treatmentSteps: string[]
                              preventionTips?: string[]
                            }
                          }
                          plantId={plantId}
                        />
                      )
                    }
                    return Option.none()
                  }
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
          ),
          Match.orElse((): Option.Option<ReactElement> => Option.none())
        )
    )
  )

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
          {renderedParts}
        </View>
        {createdAt && (
          <Text
            className={`text-xs mt-1 font-regular text-text-muted dark:text-slate-400 ${isUser ? 'mr-1' : 'ml-1'}`}
          >
            {formatApiTime(createdAt)}
          </Text>
        )}
      </View>
    </View>
  )
}
