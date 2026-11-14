import { MaterialIcons } from '@expo/vector-icons'
import type { ChatStarterPlant } from '@lily/shared/ai-chat'
import { Array, Option, pipe } from 'effect'
import * as Haptics from 'expo-haptics'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Text, useWindowDimensions, View } from 'react-native'
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { AnimatedImage } from '@/components/AnimatedImage'
import { useIconColors } from '@/hooks/useIconColors'
import { PressableScale } from '@/screens/chat/components/PressableScale'
import {
  GENERAL_TARGET,
  type NewChatTarget,
} from '@/screens/chat/new-chat-target'

const ITEM_WIDTH = 88
const OFF_CENTER_SCALE = 0.78

interface CarouselItem {
  readonly target: NewChatTarget
  readonly imageUrl: string | undefined
}

const targetKey = (target: NewChatTarget): string =>
  target.kind === 'plant' ? target.plantId : 'general'

interface PlantCarouselProps {
  plants: ReadonlyArray<ChatStarterPlant>
  selected: NewChatTarget
  onSelect: (target: NewChatTarget) => void
}

export function PlantCarousel({
  plants,
  selected,
  onSelect,
}: PlantCarouselProps) {
  const { width } = useWindowDimensions()
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const scrollX = useSharedValue(0)
  const reduceMotion = useReducedMotion()

  const items: ReadonlyArray<CarouselItem> = useMemo(
    () => [
      { target: GENERAL_TARGET, imageUrl: undefined },
      ...Array.map(plants, (plant) => ({
        target: {
          kind: 'plant' as const,
          plantId: plant.plantId,
          name: plant.name,
        },
        imageUrl: plant.imageUrl,
      })),
    ],
    [plants]
  )
  const lastIndex = items.length - 1

  const selectedIndex = pipe(
    Array.findFirstIndex(
      items,
      (item) => targetKey(item.target) === targetKey(selected)
    ),
    Option.getOrElse(() => 0)
  )

  const restingIndexRef = useRef(0)
  const programmaticScrollTo = useRef<Option.Option<number>>(Option.none())

  const scrollToIndex = useCallback(
    (index: number) => {
      programmaticScrollTo.current = Option.some(index)
      scrollRef.current?.scrollTo({ x: index * ITEM_WIDTH, animated: true })
    },
    [scrollRef]
  )

  const commit = useCallback(
    (index: number) => {
      if (index === restingIndexRef.current) return
      restingIndexRef.current = index
      Haptics.selectionAsync()
      pipe(
        Array.get(items, index),
        Option.map((item) => onSelect(item.target))
      )
    },
    [items, onSelect]
  )

  const onCenteredIndex = useCallback(
    (index: number) => {
      const destination = programmaticScrollTo.current
      if (Option.isNone(destination)) {
        commit(index)
        return
      }
      if (destination.value === index) {
        programmaticScrollTo.current = Option.none()
      }
    },
    [commit]
  )

  useEffect(() => {
    if (selectedIndex === restingIndexRef.current) return
    restingIndexRef.current = selectedIndex
    scrollToIndex(selectedIndex)
  }, [selectedIndex, scrollToIndex])

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x
    },
  })

  useAnimatedReaction(
    () =>
      Math.min(Math.max(Math.round(scrollX.value / ITEM_WIDTH), 0), lastIndex),
    (index, previous) => {
      if (previous !== null && index !== previous) {
        scheduleOnRN(onCenteredIndex, index)
      }
    },
    [lastIndex, onCenteredIndex]
  )

  return (
    <Animated.ScrollView
      ref={scrollRef}
      testID="chat-plant-carousel"
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={ITEM_WIDTH}
      decelerationRate="fast"
      scrollEventThrottle={16}
      onScroll={onScroll}
      onScrollBeginDrag={() => {
        programmaticScrollTo.current = Option.none()
      }}
      contentContainerStyle={{ paddingHorizontal: (width - ITEM_WIDTH) / 2 }}
      className="grow-0"
    >
      {Array.map(items, (item, index) => (
        <CarouselEntry
          key={targetKey(item.target)}
          item={item}
          index={index}
          scrollX={scrollX}
          reduceMotion={reduceMotion}
          isSelected={index === selectedIndex}
          onPress={() => {
            commit(index)
            scrollToIndex(index)
          }}
        />
      ))}
    </Animated.ScrollView>
  )
}

interface CarouselEntryProps {
  item: CarouselItem
  index: number
  scrollX: SharedValue<number>
  reduceMotion: boolean
  isSelected: boolean
  onPress: () => void
}

function CarouselEntry({
  item,
  index,
  scrollX,
  reduceMotion,
  isSelected,
  onPress,
}: CarouselEntryProps) {
  const { t } = useTranslation('chat')
  const iconColors = useIconColors()
  const label =
    item.target.kind === 'plant' ? item.target.name : t('starters.general')

  const focusStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollX.value - index * ITEM_WIDTH) / ITEM_WIDTH
    return {
      opacity: interpolate(
        distance,
        [0, 1, 2],
        [1, 0.75, 0.5],
        Extrapolation.CLAMP
      ),
      transform: [
        {
          scale: reduceMotion
            ? 1
            : interpolate(
                distance,
                [0, 1],
                [1, OFF_CENTER_SCALE],
                Extrapolation.CLAMP
              ),
        },
      ],
    }
  })

  const placeholder = (
    <View className="flex-1 items-center justify-center bg-gray-100 dark:bg-slate-700">
      <MaterialIcons
        name="local-florist"
        size={26}
        color={iconColors.primary}
      />
    </View>
  )

  return (
    <Animated.View style={[{ width: ITEM_WIDTH }, focusStyle]}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: isSelected }}
        testID={`chat-carousel-item-${targetKey(item.target)}`}
        surfaceClassName="items-center gap-1.5"
      >
        <View
          className={`w-16 h-16 rounded-full overflow-hidden ${
            isSelected
              ? 'border-2 border-primary'
              : 'border border-border dark:border-white/10'
          }`}
        >
          {item.target.kind === 'general' ? (
            <View className="flex-1 items-center justify-center bg-surface dark:bg-white/10">
              <MaterialIcons
                name="forum"
                size={24}
                color={iconColors.primary}
              />
            </View>
          ) : item.imageUrl === undefined ? (
            placeholder
          ) : (
            <AnimatedImage
              source={{ uri: item.imageUrl }}
              className="w-full h-full"
              fallback={placeholder}
            />
          )}
        </View>
        <Text
          numberOfLines={1}
          className={`w-full px-1 text-center text-xs ${
            isSelected
              ? 'text-text-primary dark:text-white'
              : 'text-text-secondary dark:text-slate-400'
          }`}
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        >
          {label}
        </Text>
      </PressableScale>
    </Animated.View>
  )
}
