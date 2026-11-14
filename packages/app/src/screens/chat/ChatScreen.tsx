import type { ChatSuggestionTap } from '@lily/shared/ai-chat'
import { useQueryClient } from '@tanstack/react-query'
import { isToolUIPart, type UIMessage } from 'ai'
import { Array, Option, Predicate, pipe } from 'effect'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FlatList,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EmptyState } from '@/components/EmptyState'
import { useChatStarters } from '@/hooks/useChatStarters'
import {
  useChatSuggestionsVisit,
  usePrefetchChatSuggestions,
} from '@/hooks/useChatSuggestions'
import { useConversation } from '@/hooks/useConversation'
import { useConversationChat } from '@/hooks/useConversationChat'
import { useConversationMessages } from '@/hooks/useConversationMessages'
import { useCreateConversation } from '@/hooks/useCreateConversation'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useIconColors } from '@/hooks/useIconColors'
import { useKeyboardShown } from '@/hooks/useKeyboardShown'
import { usePlant } from '@/hooks/usePlant'
import { useUploadConversationImage } from '@/hooks/useUploadConversationImage'
import { AskLilyHeader } from '@/screens/chat/components/AskLilyHeader'
import { ChatInput } from '@/screens/chat/components/ChatInput'
import { ChatMessage } from '@/screens/chat/components/ChatMessage'
import { ChatMessagesSkeleton } from '@/screens/chat/components/ChatMessagesSkeleton'
import { ConversationsDrawer } from '@/screens/chat/components/ConversationsDrawer'
import { PlantCarousel } from '@/screens/chat/components/PlantCarousel'
import {
  FollowUpChips,
  SuggestionChips,
} from '@/screens/chat/components/SuggestionChips'
import { TypingIndicator } from '@/screens/chat/components/TypingIndicator'
import { toolResultId } from '@/screens/chat/components/tool-renderers'
import {
  carouselNeighbours,
  chipsOf,
  GENERAL_TARGET,
  historyOf,
  type NewChatTarget,
  newConversationPayload,
} from '@/screens/chat/new-chat-target'

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

/** Stable ids of completed diagnosis / plan tool results in these messages. */
const collectToolResultIds = (
  messages: ReadonlyArray<UIMessage>
): ReadonlyArray<string> =>
  pipe(
    messages,
    Array.flatMap((msg) =>
      pipe(
        msg.parts,
        Array.map((part) =>
          isToolUIPart(part) ? toolResultId(part) : Option.none()
        ),
        Array.getSomes
      )
    )
  )

const ESTIMATED_BAR_HEIGHT = 56
const MID_FADE_ALPHA_HEX = 'B3'

const EDGE_FADE = {
  top: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  bottom: { start: { x: 0, y: 1 }, end: { x: 0, y: 0 } },
} as const

function EdgeFade({
  edge,
  solidLength,
  barLength,
}: {
  edge: keyof typeof EDGE_FADE
  solidLength: number
  barLength: number
}) {
  const { background } = useIconColors()
  const { start, end } = EDGE_FADE[edge]
  const solidEnd = Math.min(solidLength / Math.max(barLength, 1), 1)
  const midFade = (solidEnd + 1) / 2
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <LinearGradient
        colors={[
          background,
          background,
          `${background}${MID_FADE_ALPHA_HEX}`,
          `${background}00`,
        ]}
        locations={[0, solidEnd, midFade, 1]}
        start={start}
        end={end}
        style={{ flex: 1 }}
      />
    </View>
  )
}

export function ChatScreen() {
  const { t } = useTranslation('chat')
  const insets = useSafeAreaInsets()
  const { conversationId: paramId } = useLocalSearchParams<{
    conversationId?: string
  }>()
  const flatListRef = useRef<FlatList<UIMessage>>(null)
  const queryClient = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const createConversation = useCreateConversation()

  const [activeConversationId, setActiveConversationId] = useState<
    string | undefined
  >(paramId)
  const [newChatTarget, setNewChatTarget] =
    useState<NewChatTarget>(GENERAL_TARGET)
  const [pendingMessage, setPendingMessage] = useState<{
    content: string
    imageUri?: string | undefined
    suggestion?: ChatSuggestionTap | undefined
  } | null>(null)
  // Covers the image upload and the ai SDK's await before it pushes the user
  // message, when neither the status nor the message list has changed yet.
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    setActiveConversationId(paramId)
    setNewChatTarget(GENERAL_TARGET)
  }, [paramId])

  // Plant-bound cards (diagnosis, care plan) need the conversation's plant id
  // to read their server state and to act on it.
  const { data: conversation } = useConversation(activeConversationId)
  const conversationPlantId = conversation?.plantId
  const targetPlant = newChatTarget.kind === 'plant' ? newChatTarget : undefined
  const isPlantChat = Predicate.isUndefined(conversation)
    ? Predicate.isNotUndefined(targetPlant)
    : Predicate.isNotNullish(conversationPlantId)
  const { data: plant } = usePlant(
    Option.getOrElse(Option.fromNullishOr(conversationPlantId), () => '')
  )
  const subjectName = plant?.name ?? targetPlant?.name

  const { data: starters } = useChatStarters(activeConversationId === undefined)
  const prefetchSuggestions = usePrefetchChatSuggestions()
  const { isVisiting, sentIn, markSent } = useChatSuggestionsVisit()

  useEffect(() => {
    if (
      !isVisiting ||
      activeConversationId !== undefined ||
      starters === undefined
    )
      return
    Array.forEach(
      carouselNeighbours(starters.plants, newChatTarget),
      prefetchSuggestions
    )
  }, [
    isVisiting,
    activeConversationId,
    starters,
    newChatTarget,
    prefetchSuggestions,
  ])

  const {
    isLoading: isLoadingHistory,
    initialMessages,
    error: historyError,
    refetch: _refetchHistory,
  } = useConversationMessages(activeConversationId)
  const refetchHistory = _refetchHistory as () => void

  const {
    messages: chatMessages,
    sendMessage,
    regenerate,
    status,
    error: chatError,
    pendingImageUrl,
  } = useConversationChat({
    conversationId: activeConversationId ?? '',
    initialMessages,
  })

  // Auto-open the sheet for a diagnosis / plan that just arrived. Results are
  // tracked by their stable output id so the sheet survives the history
  // refetch that swaps streamed messages for persisted ones. History loaded
  // for a conversation is seeded as "seen" and never auto-opens.
  const seenToolIdsRef = useRef<Set<string>>(new Set())
  const historyMessageIdsRef = useRef<Set<string>>(new Set())
  const sentInSessionRef = useRef(false)
  const [autoOpenToolId, setAutoOpenToolId] = useState<string | null>(null)
  const clearAutoOpen = useCallback(() => setAutoOpenToolId(null), [])

  const trackedConversationRef = useRef(activeConversationId)
  useEffect(() => {
    if (trackedConversationRef.current === activeConversationId) return
    trackedConversationRef.current = activeConversationId
    seenToolIdsRef.current = new Set()
    historyMessageIdsRef.current = new Set()
    sentInSessionRef.current = false
    setAutoOpenToolId(null)
  }, [activeConversationId])

  useEffect(() => {
    const history = pipe(
      Option.fromNullishOr(initialMessages),
      Option.getOrElse(() => [] as ReadonlyArray<UIMessage>)
    )
    Array.forEach(collectToolResultIds(history), (id) => {
      seenToolIdsRef.current.add(id)
    })
    Array.forEach(history, (msg) => {
      historyMessageIdsRef.current.add(msg.id)
    })
  }, [initialMessages])

  useEffect(() => {
    if (!sentInSessionRef.current) return
    const fresh = Array.filter(
      collectToolResultIds(chatMessages),
      (id) => !seenToolIdsRef.current.has(id)
    )
    if (!Array.isReadonlyArrayNonEmpty(fresh)) return
    Array.forEach(fresh, (id) => {
      seenToolIdsRef.current.add(id)
    })
    setAutoOpenToolId(Array.headNonEmpty(fresh))
  }, [chatMessages])

  const uploadImage = useUploadConversationImage(activeConversationId ?? '')
  const isStreaming = status === 'submitted' || status === 'streaming'

  const chips = chipsOf({
    target: newChatTarget,
    conversation: Option.fromUndefinedOr(conversation),
    isOpened: activeConversationId !== undefined,
    history: historyOf(initialMessages),
    isReplying: isStreaming,
    isVisiting,
    sentIn,
  })

  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const selectConversation = useCallback((id: string) => {
    setActiveConversationId(id)
    setNewChatTarget(GENERAL_TARGET)
  }, [])
  const resetConversation = useCallback(() => {
    setActiveConversationId(undefined)
    setNewChatTarget(GENERAL_TARGET)
  }, [])

  const displayMessages: UIMessage[] = pipe(
    chatMessages,
    Array.filter(
      (msg: UIMessage) =>
        !(isStreaming && msg.role === 'assistant' && hasNoVisibleContent(msg))
    ),
    Array.reverse
  )

  const refreshConversationQueries = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['aiChat', 'getConversationMessages'],
    })
    queryClient.invalidateQueries({
      queryKey: ['aiChat', 'listConversations'],
    })
    queryClient.invalidateQueries({
      queryKey: ['aiChat', 'listChatStarters'],
    })
  }, [queryClient])

  const lastRequestOptionsRef = useRef<{ body?: { imageKey: string } }>({})

  const scrollToLatestMessage = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
  }, [])

  const sendInternal = useCallback(
    async (
      content: string,
      imageUri?: string,
      suggestion?: ChatSuggestionTap
    ) => {
      if (isStreaming) return
      sentInSessionRef.current = true
      markSent(activeConversationId)
      setIsSending(true)
      scrollToLatestMessage()

      let uploadedImageKey: string | undefined
      let uploadedImageUrl: string | undefined

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

      const imageOption = Option.fromNullishOr(uploadedImageUrl)
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

      lastRequestOptionsRef.current = pipe(
        Option.fromNullishOr(uploadedImageKey),
        Option.match({
          onNone: () => ({}),
          onSome: (imageKey) => ({ body: { imageKey } }),
        })
      )

      try {
        await sendMessage(messagePayload, {
          body: {
            ...lastRequestOptionsRef.current.body,
            ...(suggestion !== undefined ? { suggestion } : {}),
          },
        })
      } finally {
        setIsSending(false)
      }

      pendingImageUrl.current = undefined
      refreshConversationQueries()
    },
    [
      isStreaming,
      activeConversationId,
      markSent,
      scrollToLatestMessage,
      sendMessage,
      refreshConversationQueries,
      uploadImage,
      pendingImageUrl,
    ]
  )

  const retryFailedTurn = useCallback(async () => {
    await regenerate(lastRequestOptionsRef.current)
    refreshConversationQueries()
  }, [regenerate, refreshConversationQueries])

  const handleSend = useCallback(
    async (
      content: string,
      imageUri?: string,
      suggestion?: ChatSuggestionTap
    ) => {
      if (activeConversationId) {
        await sendInternal(content, imageUri, suggestion)
        return
      }
      // No conversation yet — create one lazily, then queue the message to be
      // sent once the chat hooks have re-initialized with the new id.
      createConversation.mutate(
        { payload: newConversationPayload(newChatTarget) },
        {
          onSuccess: (created) => {
            setActiveConversationId(created.id)
            setPendingMessage({ content, imageUri, suggestion })
          },
        }
      )
    },
    [activeConversationId, sendInternal, createConversation, newChatTarget]
  )

  const sendSuggestion = useCallback(
    (text: string, suggestion: ChatSuggestionTap) =>
      handleSend(text, undefined, suggestion),
    [handleSend]
  )

  // The chat hook's transport URL captures conversationId at init, so the
  // first message has to wait for the hook to re-bind to the just-created id.
  useEffect(() => {
    if (!activeConversationId || !pendingMessage) return
    const msg = pendingMessage
    setPendingMessage(null)
    sendInternal(msg.content, msg.imageUri, msg.suggestion)
  }, [activeConversationId, pendingMessage, sendInternal])

  const arrivedInSession = useCallback(
    (messageId: string) =>
      sentInSessionRef.current &&
      trackedConversationRef.current === activeConversationId &&
      !historyMessageIdsRef.current.has(messageId),
    [activeConversationId]
  )

  const renderMessage = useCallback(
    ({ item }: { item: UIMessage }) => (
      <ChatMessage
        message={item}
        plantId={conversationPlantId}
        autoOpenToolId={autoOpenToolId}
        onAutoOpenHandled={clearAutoOpen}
        arrivedInSession={arrivedInSession(item.id)}
      />
    ),
    [conversationPlantId, autoOpenToolId, clearAutoOpen, arrivedInSession]
  )

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

  const mascotFits = !useKeyboardShown()
  const isInitialLoading = isLoadingHistory && !initialMessages
  const showSkeleton = useDelayedLoading(isInitialLoading)

  // Rendered in place of the list: an inverted FlatList counter-flips its
  // empty component through a `style` prop, which EmptyState does not take.
  const isNewChat =
    Array.isArrayEmpty(chatMessages) &&
    !isStreaming &&
    !isSending &&
    pendingMessage === null &&
    !createConversation.isPending

  const [headerHeight, setHeaderHeight] = useState(
    insets.top + ESTIMATED_BAR_HEIGHT
  )
  const [composerHeight, setComposerHeight] = useState(
    Math.max(insets.bottom, 12) + ESTIMATED_BAR_HEIGHT
  )
  const onHeaderLayout = useCallback(
    (e: LayoutChangeEvent) => setHeaderHeight(e.nativeEvent.layout.height),
    []
  )
  const onComposerLayout = useCallback(
    (e: LayoutChangeEvent) => setComposerHeight(e.nativeEvent.layout.height),
    []
  )

  const header = (
    <AskLilyHeader
      onMenuPress={openDrawer}
      subtitle={isPlantChat ? subjectName : undefined}
    />
  )

  if (historyError) {
    return (
      <View
        className="flex-1 bg-background dark:bg-background-dark"
        style={{ paddingTop: insets.top }}
      >
        {header}
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-lg text-center font-semibold text-text-primary dark:text-white">
            {t('loadError')}
          </Text>
          <Pressable
            onPress={() => refetchHistory()}
            className="mt-6 px-6 py-3 rounded-full bg-primary"
          >
            <Text className="font-semibold text-white">
              {t('common:buttons.tryAgain')}
            </Text>
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
        {header}
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          <ChatMessagesSkeleton />
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
        {header}
      </View>
    )
  }

  return (
    <View
      testID="chat-screen"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        <View className="flex-1">
          {isNewChat ? (
            <View
              className="flex-1 justify-end"
              style={{
                paddingTop: headerHeight,
                paddingBottom: composerHeight,
              }}
            >
              {mascotFits && (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  exiting={FadeOut.duration(150)}
                  className="flex-1"
                >
                  <EmptyState kind="chatNew" />
                </Animated.View>
              )}
              {activeConversationId === undefined &&
                starters !== undefined &&
                Array.isReadonlyArrayNonEmpty(starters.plants) && (
                  <PlantCarousel
                    plants={starters.plants}
                    selected={newChatTarget}
                    onSelect={setNewChatTarget}
                  />
                )}
              {chips.kind === 'starter' && (
                <SuggestionChips
                  subject={chips.subject}
                  onSelect={sendSuggestion}
                />
              )}
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={displayMessages}
              renderItem={renderMessage}
              keyExtractor={(item) => item.id}
              inverted
              // Inverted: paddingTop is the visual bottom.
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: composerHeight + 4,
                paddingBottom: headerHeight + 16,
              }}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <TypingIndicator visible={showTypingIndicator} />
              }
            />
          )}

          <View
            pointerEvents="box-none"
            className="absolute bottom-0 left-0 right-0"
            onLayout={onComposerLayout}
          >
            <EdgeFade
              edge="bottom"
              solidLength={insets.bottom}
              barLength={composerHeight}
            />
            {chatError && (
              <View className="mx-3 mb-1 rounded-[28px] bg-background dark:bg-background-dark">
                <View className="flex-row items-center gap-3 rounded-[28px] bg-error/10 py-1.5 pl-4 pr-1.5">
                  <Text
                    className="flex-1 text-sm text-error"
                    style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                  >
                    {t('sendError')}
                  </Text>
                  <Pressable
                    onPress={retryFailedTurn}
                    accessibilityRole="button"
                    testID="chat-retry-button"
                    className="rounded-full bg-error px-4 py-2 active:opacity-70"
                  >
                    <Text
                      className="text-sm text-white"
                      style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                    >
                      {t('common:buttons.retry')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {chips.kind === 'followUp' && (
              <FollowUpChips
                plantId={chips.plantId}
                onSelect={sendSuggestion}
              />
            )}

            <ChatInput
              onSend={handleSend}
              disabled={isStreaming || uploadImage.isPending}
              isPlantChat={isPlantChat}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      <View
        pointerEvents="box-none"
        className="absolute top-0 left-0 right-0"
        style={{ paddingTop: insets.top }}
        onLayout={onHeaderLayout}
      >
        <EdgeFade
          edge="top"
          solidLength={insets.top}
          barLength={headerHeight}
        />
        {header}
      </View>

      <ConversationsDrawer
        visible={drawerOpen}
        onClose={closeDrawer}
        currentConversationId={activeConversationId}
        onSelectConversation={selectConversation}
        onNewChat={resetConversation}
      />
    </View>
  )
}
