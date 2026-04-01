import { Number as EffectNumber, Option, pipe } from 'effect'
import { useEffect } from 'react'
import { Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useIconColors } from 'src/hooks/useIconColors'

interface ProgressBarProps {
  progress: number
  label?: string
  color?: string
  height?: number
  showPercentage?: boolean
  animated?: boolean
  testID?: string
}

export function ProgressBar({
  progress,
  label,
  color,
  height = 8,
  showPercentage = false,
  animated = false,
  testID,
}: ProgressBarProps) {
  const iconColors = useIconColors()
  const barColor = pipe(
    Option.fromNullable(color),
    Option.getOrElse(() => iconColors.primary)
  )

  const clampedProgress = EffectNumber.clamp(progress, {
    minimum: 0,
    maximum: 1,
  })
  const percentage = Math.round(clampedProgress * 100)

  const animatedWidth = useSharedValue(animated ? 0 : percentage)

  useEffect(() => {
    if (animated) {
      animatedWidth.value = withTiming(percentage, { duration: 600 })
    } else {
      animatedWidth.value = percentage
    }
  }, [percentage, animated, animatedWidth])

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${animatedWidth.value}%`,
    backgroundColor: barColor,
  }))

  return (
    <View testID={testID} className="w-full">
      {(label || showPercentage) && (
        <View className="flex-row justify-between mb-2">
          {label && (
            <Text className="text-sm text-text-muted dark:text-slate-400 font-regular">
              {label}
            </Text>
          )}
          {showPercentage && (
            <Text className="text-sm text-text-muted dark:text-slate-400 font-medium">
              {percentage}%
            </Text>
          )}
        </View>
      )}
      <View
        className="w-full rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700"
        style={{ height }}
      >
        <Animated.View className="h-full rounded-full" style={animatedStyle} />
      </View>
    </View>
  )
}
