import { Array } from 'effect'
import { useEffect } from 'react'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import {
  typingEntering,
  typingExiting,
} from '@/screens/chat/components/chat-motion'

const DOT_DELAYS = [0, 150, 300] as const

function Dot({ delay }: { delay: number }) {
  const reducedMotion = useReducedMotion()
  const progress = useSharedValue(0)

  useEffect(() => {
    if (reducedMotion) return
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 400, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      )
    )
    return () => cancelAnimation(progress)
  }, [delay, progress, reducedMotion])

  const style = useAnimatedStyle(() => ({
    opacity: 0.5 + progress.value * 0.5,
    transform: [{ translateY: progress.value * -4 }],
  }))

  return (
    <Animated.View className="w-2 h-2 rounded-full bg-primary" style={style} />
  )
}

export function TypingIndicator({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <Animated.View
      entering={typingEntering}
      exiting={typingExiting}
      className="flex-row items-center h-6 mb-6 gap-1.5"
    >
      {Array.map(DOT_DELAYS, (delay) => (
        <Dot key={delay} delay={delay} />
      ))}
    </Animated.View>
  )
}
