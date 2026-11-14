import type { ReactNode } from 'react'
import { Pressable, type PressableProps } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

const PRESSED_SCALE = 0.92
const PRESS_TIMING = { duration: 120, easing: Easing.out(Easing.quad) }

interface PressableScaleProps
  extends Omit<PressableProps, 'children' | 'style' | 'className'> {
  surfaceClassName: string
  children: ReactNode
}

export function PressableScale({
  surfaceClassName,
  children,
  onPressIn,
  onPressOut,
  ...props
}: PressableScaleProps) {
  const scale = useSharedValue(1)
  const surfaceStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <Pressable
      {...props}
      onPressIn={(event) => {
        scale.value = withTiming(PRESSED_SCALE, PRESS_TIMING)
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        scale.value = withTiming(1, PRESS_TIMING)
        onPressOut?.(event)
      }}
    >
      <Animated.View className={surfaceClassName} style={surfaceStyle}>
        {children}
      </Animated.View>
    </Pressable>
  )
}
