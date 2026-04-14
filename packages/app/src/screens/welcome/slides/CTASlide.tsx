import { Array as Arr } from 'effect'
import { useEffect, useMemo } from 'react'
import { Dimensions, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { SlideTextContent } from '../components/SlideTextContent'

const { width, height } = Dimensions.get('window')

interface CTASlideProps {
  title: string
  subtitle: string
}

interface Particle {
  id: number
  x: number
  y: number
  size: number
  durationMs: number
  initialDelay: number
}

const PARTICLE_COUNT = 10

export function CTASlide({ title, subtitle }: CTASlideProps) {
  const particles = useMemo<Particle[]>(
    () =>
      Arr.map(Arr.range(0, PARTICLE_COUNT - 1), (i) => ({
        id: i,
        x: 20 + Math.random() * (width - 80),
        y: 40 + Math.random() * (height * 0.5),
        size: 4 + Math.random() * 12,
        durationMs: 1500 + Math.random() * 2000,
        initialDelay: Math.random() * 1000,
      })),
    []
  )

  return (
    <View style={{ width }} className="flex-1">
      <View style={StyleSheet.absoluteFill}>
        {Arr.map(particles, (p) => (
          <PulsingParticle key={p.id} particle={p} />
        ))}
      </View>

      <View className="flex-1 items-center justify-center">
        <Animated.Text
          entering={FadeIn.delay(300).duration(600)}
          className="text-7xl"
        >
          🌿
        </Animated.Text>
      </View>

      <View className="px-8">
        <SlideTextContent title={title} subtitle={subtitle} />
      </View>
    </View>
  )
}

function PulsingParticle({ particle }: { particle: Particle }) {
  const scale = useSharedValue(0)
  const opacity = useSharedValue(0)

  useEffect(() => {
    opacity.value = withDelay(
      particle.initialDelay,
      withRepeat(
        withSequence(
          withTiming(0.6, {
            duration: particle.durationMs,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0.15, {
            duration: particle.durationMs,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        false
      )
    )
    scale.value = withDelay(
      particle.initialDelay,
      withRepeat(
        withSequence(
          withTiming(1.3, {
            duration: particle.durationMs,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0.8, {
            duration: particle.durationMs,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        false
      )
    )
  }, [opacity, scale, particle.durationMs, particle.initialDelay])

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: particle.x,
          top: particle.y,
          width: particle.size,
          height: particle.size,
          borderRadius: particle.size / 2,
          backgroundColor: 'rgba(255, 255, 255, 0.5)',
        },
        animStyle,
      ]}
    />
  )
}
