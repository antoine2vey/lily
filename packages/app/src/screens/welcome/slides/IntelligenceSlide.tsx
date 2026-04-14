import { MaterialIcons } from '@expo/vector-icons'
import { useEffect } from 'react'
import { Dimensions, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { SlideTextContent } from '../components/SlideTextContent'

const { width } = Dimensions.get('window')

interface IntelligenceSlideProps {
  title: string
  subtitle: string
}

export function IntelligenceSlide({ title, subtitle }: IntelligenceSlideProps) {
  const scanY = useSharedValue(0)
  const cardTranslateY = useSharedValue(80)
  const cardOpacity = useSharedValue(0)
  const orbit1 = useSharedValue(0)
  const orbit2 = useSharedValue(120)
  const orbit3 = useSharedValue(240)

  useEffect(() => {
    scanY.value = withRepeat(
      withTiming(120, {
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    )

    cardTranslateY.value = withDelay(1600, withSpring(0, { damping: 12 }))
    cardOpacity.value = withDelay(1600, withTiming(1, { duration: 300 }))

    const orbitDuration = 8000
    orbit1.value = withRepeat(
      withTiming(360, {
        duration: orbitDuration,
        easing: Easing.linear,
      }),
      -1,
      false
    )
    orbit2.value = withRepeat(
      withTiming(480, {
        duration: orbitDuration + 1000,
        easing: Easing.linear,
      }),
      -1,
      false
    )
    orbit3.value = withRepeat(
      withTiming(600, {
        duration: orbitDuration + 2000,
        easing: Easing.linear,
      }),
      -1,
      false
    )
  }, [scanY, cardTranslateY, cardOpacity, orbit1, orbit2, orbit3])

  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanY.value }],
  }))

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardTranslateY.value }],
    opacity: cardOpacity.value,
  }))

  const orbit1Style = useAnimatedStyle(() => {
    const rad = (orbit1.value * Math.PI) / 180
    return {
      transform: [
        { translateX: Math.cos(rad) * 90 },
        { translateY: Math.sin(rad) * 90 },
      ],
    }
  })

  const orbit2Style = useAnimatedStyle(() => {
    const rad = (orbit2.value * Math.PI) / 180
    return {
      transform: [
        { translateX: Math.cos(rad) * 90 },
        { translateY: Math.sin(rad) * 90 },
      ],
    }
  })

  const orbit3Style = useAnimatedStyle(() => {
    const rad = (orbit3.value * Math.PI) / 180
    return {
      transform: [
        { translateX: Math.cos(rad) * 90 },
        { translateY: Math.sin(rad) * 90 },
      ],
    }
  })

  return (
    <View style={{ width }} className="flex-1 items-center px-8">
      <View className="flex-1 items-center justify-center">
        <View className="w-44 h-56 rounded-2xl border-2 border-white/30 items-center justify-center overflow-hidden">
          <Animated.View
            className="absolute left-2 right-2 h-0.5 bg-primary rounded-full"
            style={scanLineStyle}
          />

          <Text className="text-5xl">🌿</Text>

          <Animated.View
            className="absolute bottom-0 left-0 right-0 bg-white/15 rounded-t-xl p-3"
            style={cardStyle}
          >
            <View className="flex-row items-center gap-2">
              <Text className="text-lg">🌱</Text>
              <View className="flex-1">
                <Text
                  className="text-xs text-white"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                >
                  Monstera Deliciosa
                </Text>
                <View className="flex-row items-center gap-1 mt-0.5">
                  <MaterialIcons
                    name="wb-sunny"
                    size={10}
                    color="rgba(255,255,255,0.6)"
                  />
                  <Text className="text-[10px] text-white/60">22°C</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>

        <Animated.View
          className="absolute w-8 h-8 rounded-full bg-water-blue/20 items-center justify-center"
          style={orbit1Style}
        >
          <MaterialIcons
            name="water-drop"
            size={16}
            color="rgba(96,165,250,0.8)"
          />
        </Animated.View>
        <Animated.View
          className="absolute w-8 h-8 rounded-full bg-warning/20 items-center justify-center"
          style={orbit2Style}
        >
          <MaterialIcons
            name="wb-sunny"
            size={16}
            color="rgba(245,158,11,0.8)"
          />
        </Animated.View>
        <Animated.View
          className="absolute w-8 h-8 rounded-full bg-primary/20 items-center justify-center"
          style={orbit3Style}
        >
          <MaterialIcons
            name="location-on"
            size={16}
            color="rgba(91,140,90,0.8)"
          />
        </Animated.View>
      </View>

      <SlideTextContent title={title} subtitle={subtitle} />
    </View>
  )
}
