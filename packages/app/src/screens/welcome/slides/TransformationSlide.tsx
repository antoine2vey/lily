import { Array as Arr } from 'effect'
import { useEffect, useState } from 'react'
import { Dimensions, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { SlideTextContent } from '../components/SlideTextContent'

const { width } = Dimensions.get('window')

interface TransformationSlideProps {
  title: string
  subtitle: string
}

const growthStages = [
  { emoji: '🌱', label: 'Day 1' },
  { emoji: '🪴', label: 'Week 2' },
  { emoji: '🌿', label: 'Month 1' },
  { emoji: '🌳', label: 'Month 3' },
]

const badges = [
  { emoji: '💧', delay: 2000 },
  { emoji: '🌿', delay: 2200 },
  { emoji: '⭐', delay: 2400 },
]

export function TransformationSlide({
  title,
  subtitle,
}: TransformationSlideProps) {
  const streakRaw = useSharedValue(0)
  const [streakDisplay, setStreakDisplay] = useState(0)

  useEffect(() => {
    streakRaw.value = withDelay(800, withTiming(47, { duration: 1500 }))
  }, [streakRaw])

  const streakRounded = useDerivedValue(() => Math.round(streakRaw.value))

  useAnimatedReaction(
    () => streakRounded.value,
    (val) => runOnJS(setStreakDisplay)(val)
  )

  return (
    <View style={{ width }} className="flex-1 items-center px-8">
      <View className="flex-1 items-center justify-center">
        <View className="flex-row items-end gap-4 mb-8">
          {Arr.map(growthStages, (stage, i) => (
            <Animated.View
              key={stage.label}
              entering={FadeIn.delay(i * 400).duration(300)}
              className="items-center"
            >
              <Text
                className={
                  i === 3
                    ? 'text-5xl'
                    : i === 2
                      ? 'text-4xl'
                      : i === 1
                        ? 'text-3xl'
                        : 'text-2xl'
                }
              >
                {stage.emoji}
              </Text>
              <Text
                className="text-[10px] text-white/40 mt-1"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
              >
                {stage.label}
              </Text>
            </Animated.View>
          ))}
        </View>

        <Animated.View
          entering={FadeIn.delay(300).duration(800)}
          className="w-48 h-px bg-white/20 mb-8 -mt-4"
        />

        <Animated.View
          entering={FadeIn.delay(800).duration(400)}
          className="flex-row items-baseline gap-1 mb-6"
        >
          <Text
            className="text-5xl text-white"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
          >
            {streakDisplay}
          </Text>
          <Text
            className="text-base text-white/50"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            days
          </Text>
        </Animated.View>

        <View className="flex-row gap-3">
          {Arr.map(badges, (badge) => (
            <BadgeIcon
              key={badge.emoji}
              emoji={badge.emoji}
              delay={badge.delay}
            />
          ))}
        </View>
      </View>

      <SlideTextContent title={title} subtitle={subtitle} />
    </View>
  )
}

function BadgeIcon({ emoji, delay }: { emoji: string; delay: number }) {
  const scale = useSharedValue(0)

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withSequence(
        withTiming(1.2, { duration: 150 }),
        withSpring(1, { damping: 6 })
      )
    )
  }, [scale, delay])

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <Animated.View
      className="w-14 h-14 rounded-full bg-white/10 items-center justify-center"
      style={badgeStyle}
    >
      <Text className="text-2xl">{emoji}</Text>
    </Animated.View>
  )
}
