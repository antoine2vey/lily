import { MaterialIcons } from '@expo/vector-icons'
import { Array as Arr } from 'effect'
import { useEffect } from 'react'
import { Dimensions, View } from 'react-native'
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { SlideTextContent } from '../components/SlideTextContent'

const { width } = Dimensions.get('window')

interface PainSlideProps {
  title: string
  subtitle: string
}

const confusionIcons = [
  { name: 'water-drop' as const, delay: 400 },
  { name: 'wb-sunny' as const, delay: 600 },
  { name: 'calendar-today' as const, delay: 800 },
]

export function PainSlide({ title, subtitle }: PainSlideProps) {
  const leafRotation = useSharedValue(-15)
  const leafOpacity = useSharedValue(0.5)

  useEffect(() => {
    leafRotation.value = withDelay(
      800,
      withSpring(0, { damping: 8, stiffness: 80 })
    )
    leafOpacity.value = withDelay(800, withTiming(1, { duration: 600 }))
  }, [leafRotation, leafOpacity])

  const leafStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${leafRotation.value}deg` }],
    opacity: leafOpacity.value,
  }))

  return (
    <View style={{ width }} className="flex-1 items-center px-8">
      <View className="flex-1 items-center justify-center">
        <Animated.Text className="text-8xl mb-10" style={leafStyle}>
          🍃
        </Animated.Text>

        <View className="flex-row gap-5">
          {Arr.map(confusionIcons, (icon) => (
            <ConfusionIcon
              key={icon.name}
              name={icon.name}
              delay={icon.delay}
            />
          ))}
        </View>
      </View>

      <SlideTextContent title={title} subtitle={subtitle} />
    </View>
  )
}

function ConfusionIcon({
  name,
  delay,
}: {
  name: 'water-drop' | 'wb-sunny' | 'calendar-today'
  delay: number
}) {
  const pulse = useSharedValue(1)

  useEffect(() => {
    pulse.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.1, { duration: 800 }),
          withTiming(1, { duration: 800 })
        ),
        -1,
        true
      )
    )
  }, [pulse, delay])

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }))

  return (
    <Animated.View
      entering={FadeIn.delay(delay).duration(400)}
      style={pulseStyle}
    >
      <View className="w-14 h-14 rounded-2xl bg-white/10 items-center justify-center">
        <MaterialIcons name={name} size={24} color="rgba(255,255,255,0.4)" />
      </View>
    </Animated.View>
  )
}
