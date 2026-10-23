import type { AchievementRarity, AchievementWithProgress } from '@lily/shared'
import { Array, Match, pipe } from 'effect'
import type { TFunction } from 'i18next'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type LayoutChangeEvent,
  Modal,
  Pressable,
  Text,
  View,
  type ViewStyle,
} from 'react-native'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { Mascot } from '@/components/Mascot'
import { useIconColors } from '@/hooks/useIconColors'

const ENTER_DURATION = 250
const EXIT_DURATION = 200
const OFFSET = 16
const MASCOT_SIZE = 160

type IconColors = ReturnType<typeof useIconColors>

const getRarityColor = (
  rarity: AchievementRarity,
  iconColors: IconColors
): string =>
  pipe(
    Match.value(rarity),
    Match.when('common', () => '#9CA3AF'),
    Match.when('rare', () => iconColors.info),
    Match.when('epic', () => '#8B5CF6'),
    Match.when('legendary', () => iconColors.achievementGold),
    Match.exhaustive
  )

const getRarityLabel = (rarity: AchievementRarity, t: TFunction): string =>
  t(`rarity.${rarity}`)

// --- Staggered fade-in wrapper ---

function StaggerIn({
  delay,
  style: layoutStyle,
  children,
}: {
  delay: number
  style?: ViewStyle
  children: React.ReactNode
}) {
  const opacity = useSharedValue(0)
  const translateY = useSharedValue(12)

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }))
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: 400, easing: Easing.out(Easing.ease) })
    )
  }, [opacity, translateY, delay])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }))

  return <Animated.View style={[layoutStyle, style]}>{children}</Animated.View>
}

// --- One achievement page ---

function AchievementPage({
  achievement,
  width,
  rarityColor,
}: {
  achievement: AchievementWithProgress
  width: number
  rarityColor: string
}) {
  const { t } = useTranslation('achievements')

  return (
    <View className="items-center" style={{ width }}>
      <StaggerIn delay={400}>
        <View className="mb-3">
          <Mascot animation="celebrate" size={MASCOT_SIZE} />
        </View>
      </StaggerIn>

      {/* Stretched so the row has the page's width: centred, it shrank to its
          content and a wrapped tag overlapped the description. */}
      <StaggerIn delay={500} style={{ alignSelf: 'stretch' }}>
        <View className="flex-row items-center justify-center gap-2 px-2">
          <Text
            className="shrink text-xl text-center font-bold text-text-primary"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
          >
            {achievement.name}
          </Text>
          <View
            className="shrink-0 px-2.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${rarityColor}20` }}
          >
            <Text
              className="text-xs uppercase font-semibold"
              style={{
                color: rarityColor,
                fontFamily: 'SpaceGrotesk_600SemiBold',
              }}
            >
              {getRarityLabel(achievement.rarity, t)}
            </Text>
          </View>
        </View>
      </StaggerIn>

      <StaggerIn delay={650}>
        <Text
          className="text-base text-center mt-1 font-regular text-text-secondary"
          style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
        >
          {achievement.description}
        </Text>
      </StaggerIn>
    </View>
  )
}

// --- Page dot, tracking the swipe ---

function PageDot({
  index,
  scrollX,
  pageWidth,
  color,
}: {
  index: number
  scrollX: SharedValue<number>
  pageWidth: number
  color: string
}) {
  const style = useAnimatedStyle(() => {
    const distance = Math.abs(scrollX.value / pageWidth - index)
    return {
      width: interpolate(distance, [0, 1], [16, 6], Extrapolation.CLAMP),
      opacity: interpolate(distance, [0, 1], [1, 0.3], Extrapolation.CLAMP),
    }
  })

  // Static styles stay out of className: NativeWind's wrapper freezes an
  // animated width at its first value.
  return (
    <Animated.View
      style={[{ height: 6, borderRadius: 3, backgroundColor: color }, style]}
    />
  )
}

// --- Modal content ---

function AchievementModalContent({
  achievements,
  onDismiss,
}: {
  achievements: Array.NonEmptyReadonlyArray<AchievementWithProgress>
  onDismiss: () => void
}) {
  const { t } = useTranslation('achievements')
  const iconColors = useIconColors()
  const listRef = useAnimatedRef<Animated.FlatList<AchievementWithProgress>>()
  const [pageWidth, setPageWidth] = useState(0)
  const [page, setPage] = useState(0)
  const scrollX = useSharedValue(0)

  const count = achievements.length
  const isLastPage = page >= count - 1
  const pageColors = Array.map(achievements, (a) =>
    getRarityColor(a.rarity, iconColors)
  )

  // Blends between neighbouring pages' rarity colors while swiping, clamped to
  // the first and last page so overscroll keeps the edge color.
  const accentStyle = useAnimatedStyle(() => {
    const position = pageWidth > 0 ? scrollX.value / pageWidth : 0
    return {
      backgroundColor:
        pageColors.length > 1
          ? interpolateColor(
              position,
              pageColors.map((_, i) => i),
              pageColors
            )
          : pageColors[0],
    }
  })

  // 0 = hidden, 1 = shown. The card sits OFFSET px lower while hidden, so
  // it rises as it fades in and drops as it fades out.
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: ENTER_DURATION,
      easing: Easing.out(Easing.cubic),
    })
  }, [progress])

  const handleClose = useCallback(() => {
    progress.value = withTiming(
      0,
      { duration: EXIT_DURATION, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(onDismiss)()
        }
      }
    )
  }, [onDismiss, progress])

  const handleNext = useCallback(() => {
    listRef.current?.scrollToOffset({
      offset: (page + 1) * pageWidth,
      animated: true,
    })
    setPage(page + 1)
  }, [listRef, page, pageWidth])

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setPageWidth(e.nativeEvent.layout.width)
  }, [])

  const settlePage = useCallback(
    (offset: number) => {
      if (pageWidth > 0) setPage(Math.round(offset / pageWidth))
    },
    [pageWidth]
  )

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x
    },
    onMomentumEnd: (e) => {
      runOnJS(settlePage)(e.contentOffset.x)
    },
  })

  const backdropStyle = useAnimatedStyle(() => ({
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    opacity: progress.value,
  }))

  const cardStyle = useAnimatedStyle(() => ({
    width: '85%' as unknown as number,
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * OFFSET }],
  }))

  // The backdrop sits behind the card rather than wrapping it: a Pressable
  // ancestor takes the touch and the deck could not be swiped.
  return (
    <Animated.View style={backdropStyle}>
      <Pressable className="absolute inset-0" onPress={handleClose} />
      <Animated.View style={cardStyle}>
        <View className="rounded-3xl p-6 bg-surface overflow-hidden">
          <Animated.View
            style={[
              { position: 'absolute', top: 0, left: 0, right: 0, height: 6 },
              accentStyle,
            ]}
          />

          <StaggerIn delay={300}>
            <Text
              className="text-lg text-center font-semibold text-text-primary mt-4"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            >
              {count > 1
                ? t('unlockModal.titleMany', { count })
                : t('unlockModal.title')}
            </Text>
          </StaggerIn>

          <View
            className="mt-5"
            testID="achievement-deck-frame"
            onLayout={handleLayout}
          >
            {pageWidth > 0 && (
              <Animated.FlatList
                ref={listRef}
                testID="achievement-deck"
                data={achievements}
                keyExtractor={(item) => item.key}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                getItemLayout={(_, index) => ({
                  length: pageWidth,
                  offset: pageWidth * index,
                  index,
                })}
                renderItem={({ item }) => (
                  <AchievementPage
                    achievement={item}
                    width={pageWidth}
                    rarityColor={getRarityColor(item.rarity, iconColors)}
                  />
                )}
              />
            )}
          </View>

          {count > 1 && pageWidth > 0 && (
            <StaggerIn delay={850}>
              <View className="flex-row justify-center gap-1.5 mt-5">
                {Array.map(achievements, (item, index) => (
                  <PageDot
                    key={item.key}
                    index={index}
                    scrollX={scrollX}
                    pageWidth={pageWidth}
                    color={iconColors.primary}
                  />
                ))}
              </View>
            </StaggerIn>
          )}

          <StaggerIn delay={900}>
            <Pressable
              className="bg-primary active:bg-primary-dark rounded-xl py-4 px-8 mt-6"
              onPress={isLastPage ? handleClose : handleNext}
            >
              <Text
                className="text-white text-base text-center"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              >
                {isLastPage ? t('unlockModal.continue') : t('unlockModal.next')}
              </Text>
            </Pressable>
          </StaggerIn>
        </View>
      </Animated.View>
    </Animated.View>
  )
}

// --- Main export ---

interface AchievementUnlockedModalProps {
  /** Pending unlocks; the modal opens while non-empty and shows them as one deck. */
  achievements: readonly AchievementWithProgress[]
  /** Called after the exit animation with how many pages were shown. */
  onClose: (shown: number) => void
}

export function AchievementUnlockedModal({
  achievements,
  onClose,
}: AchievementUnlockedModalProps) {
  // A snapshot keeps the deck on screen through the exit animation, after
  // the queue it came from may have changed.
  const [deck, setDeck] = useState<readonly AchievementWithProgress[]>([])

  useEffect(() => {
    if (Array.isReadonlyArrayNonEmpty(achievements)) {
      setDeck(achievements)
    }
  }, [achievements])

  const handleDismiss = useCallback(() => {
    const shown = deck.length
    setDeck([])
    onClose(shown)
  }, [deck.length, onClose])

  if (!Array.isReadonlyArrayNonEmpty(deck)) return null

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <AchievementModalContent achievements={deck} onDismiss={handleDismiss} />
    </Modal>
  )
}
