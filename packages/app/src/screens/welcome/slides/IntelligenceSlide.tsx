import { MaterialIcons } from '@expo/vector-icons'
import { useEffect } from 'react'
import { Image, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { images } from '@/assets/images'
import { useThemeContext } from '@/contexts/ThemeContext'
import { useIconColors } from '@/hooks/useIconColors'
import {
  OFFSCREEN_RESET_MS,
  SlideLayout,
  type SlideProps,
} from '../components/SlideLayout'
import { SlideMascot } from '../components/SlideMascot'

interface IntelligenceSlideProps extends SlideProps {
  /** Today's care action shown on the identification card. */
  cardAction: string
}

const CARD_HIDDEN_OFFSET = 24
// Short beat after the slide settles, so the card reads as the scan's result.
const CARD_APPEAR_DELAY_MS = 300

export function IntelligenceSlide({
  title,
  subtitle,
  cardAction,
  isActive,
  isNear,
}: IntelligenceSlideProps) {
  const iconColors = useIconColors()
  const { isDark } = useThemeContext()
  const cardTranslateY = useSharedValue(CARD_HIDDEN_OFFSET)
  const cardOpacity = useSharedValue(0)

  // The card pops up right after the slide settles, each time it shows.
  // On leaving, it stays put while its slide moves away and only resets once
  // the swipe is over and it is off screen, so it never blinks out mid-swipe.
  useEffect(() => {
    if (isActive) {
      cardTranslateY.value = withDelay(
        CARD_APPEAR_DELAY_MS,
        withSpring(0, { damping: 14, stiffness: 220 })
      )
      cardOpacity.value = withDelay(
        CARD_APPEAR_DELAY_MS,
        withTiming(1, { duration: 200 })
      )
    } else {
      cardTranslateY.value = withDelay(
        OFFSCREEN_RESET_MS,
        withTiming(CARD_HIDDEN_OFFSET, { duration: 0 })
      )
      cardOpacity.value = withDelay(
        OFFSCREEN_RESET_MS,
        withTiming(0, { duration: 0 })
      )
    }
  }, [isActive, cardTranslateY, cardOpacity])

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardTranslateY.value }],
    opacity: cardOpacity.value,
  }))

  return (
    <SlideLayout title={title} subtitle={subtitle}>
      <SlideMascot animation="scan" mounted={isNear} />

      <Animated.View
        className="mt-4 flex-row items-center gap-3 rounded-2xl bg-white/15 border border-white/25 p-3 pr-5"
        style={cardStyle}
      >
        <Image
          source={isDark ? images.appIconDark : images.appIconLight}
          className="w-11 h-11 rounded-[11px]"
        />
        <View>
          <Text
            className="text-base text-white"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            Monstera Deliciosa
          </Text>
          <View className="flex-row items-center gap-3 mt-0.5">
            <View className="flex-row items-center gap-1">
              <MaterialIcons
                name="wb-sunny"
                size={13}
                color={iconColors.white}
              />
              <Text
                className="text-xs text-white/75"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                22°C
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <MaterialIcons
                name="water-drop"
                size={13}
                color={iconColors.white}
              />
              <Text
                className="text-xs text-white/75"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                {cardAction}
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </SlideLayout>
  )
}
