import { Dimensions, View } from 'react-native'
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated'

const { width } = Dimensions.get('window')

interface WelcomeProgressBarProps {
  scrollX: SharedValue<number>
  total: number
}

export function WelcomeProgressBar({
  scrollX,
  total,
}: WelcomeProgressBarProps) {
  const fillStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      scrollX.value,
      [0, width * (total - 1)],
      [1 / total, 1]
    )
    return {
      width: `${progress * 100}%` as `${number}%`,
    }
  })

  return (
    <View className="h-1 mx-16 rounded-full bg-white/15 overflow-hidden">
      <Animated.View
        className="h-full rounded-full bg-white/70"
        style={fillStyle}
      />
    </View>
  )
}
