import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import {
  OFFSCREEN_RESET_MS,
  SlideLayout,
  type SlideProps,
} from '../components/SlideLayout'
import { SlideMascot } from '../components/SlideMascot'

interface TransformationSlideProps extends SlideProps {
  /** Unit after the streak count ("days"). */
  streakUnit: string
}

const STREAK_TARGET = 47

export function TransformationSlide({
  title,
  subtitle,
  streakUnit,
  isActive,
  isNear,
}: TransformationSlideProps) {
  const streakRaw = useSharedValue(0)
  const [streakDisplay, setStreakDisplay] = useState(0)

  // Count up each time the slide shows; reset once it is off screen.
  useEffect(() => {
    streakRaw.value = isActive
      ? withDelay(600, withTiming(STREAK_TARGET, { duration: 1500 }))
      : withDelay(OFFSCREEN_RESET_MS, withTiming(0, { duration: 0 }))
  }, [isActive, streakRaw])

  const streakRounded = useDerivedValue(() => Math.round(streakRaw.value))

  useAnimatedReaction(
    () => streakRounded.value,
    (val) => scheduleOnRN(setStreakDisplay, val)
  )

  return (
    <SlideLayout title={title} subtitle={subtitle}>
      <SlideMascot animation="jump" mounted={isNear} />

      <View className="flex-row items-baseline gap-1.5 mt-2">
        <Text
          className="text-5xl text-white"
          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
        >
          {streakDisplay}
        </Text>
        <Text
          className="text-base text-white/75"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        >
          {streakUnit}
        </Text>
      </View>
    </SlideLayout>
  )
}
