import { MaterialIcons } from '@expo/vector-icons'
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useIconColors } from '@/hooks/useIconColors'

interface ToolLoadingIndicatorProps {
  label: string
}

export function ToolLoadingIndicator({ label }: ToolLoadingIndicatorProps) {
  const iconColors = useIconColors()
  const reducedMotion = useReducedMotion()
  const pulse = useSharedValue(reducedMotion ? 1 : 0)

  useEffect(() => {
    if (reducedMotion) return
    pulse.value = withRepeat(
      withTiming(1, { duration: 750, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    )
    return () => cancelAnimation(pulse)
  }, [pulse, reducedMotion])

  const iconStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + pulse.value * 0.5,
    transform: [{ scale: 0.85 + pulse.value * 0.15 }],
  }))
  const labelStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + pulse.value * 0.55,
  }))

  return (
    <View className="flex-row items-center py-2">
      <Animated.View style={iconStyle}>
        <MaterialIcons
          name="auto-awesome"
          size={14}
          color={iconColors.primary}
        />
      </Animated.View>
      <Animated.Text
        className="text-sm text-text-muted dark:text-slate-400 ml-2 font-regular"
        style={labelStyle}
      >
        {label}
      </Animated.Text>
    </View>
  )
}
