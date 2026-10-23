import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { HERO_MASCOT_SIZE } from '@/components/MascotHero'
import { SlideLayout, type SlideProps } from '../components/SlideLayout'
import { SlideMascot } from '../components/SlideMascot'

const HALO_SIZE = Math.round(HERO_MASCOT_SIZE * 1.1)
const RING_SIZE = Math.round(HERO_MASCOT_SIZE * 1.35)

export function CTASlide({ title, subtitle, isNear }: SlideProps) {
  const breath = useSharedValue(0)

  useEffect(() => {
    breath.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    )
  }, [breath])

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breath.value, [0, 1], [0.6, 1]),
    transform: [{ scale: interpolate(breath.value, [0, 1], [0.94, 1.04]) }],
  }))

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breath.value, [0, 1], [0.4, 0.9]),
    transform: [{ scale: interpolate(breath.value, [0, 1], [0.97, 1.03]) }],
  }))

  return (
    <SlideLayout title={title} subtitle={subtitle}>
      <View className="items-center justify-center">
        <Animated.View
          className="absolute rounded-full border border-white/15"
          style={[{ width: RING_SIZE, height: RING_SIZE }, ringStyle]}
        />
        <Animated.View
          className="absolute rounded-full bg-white/10"
          style={[{ width: HALO_SIZE, height: HALO_SIZE }, haloStyle]}
        />
        <SlideMascot animation="hello" mounted={isNear} />
      </View>
    </SlideLayout>
  )
}
