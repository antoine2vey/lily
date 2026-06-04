import { Array, pipe } from 'effect'
import { View } from 'react-native'
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated'

const DOT_INACTIVE_WIDTH = 8
const DOT_ACTIVE_WIDTH = 24

interface DotProps {
  index: number
  scrollX: SharedValue<number>
  width: number
}

/**
 * A single dot whose width/opacity interpolate from the carousel's horizontal
 * scroll position — it grows and brightens as its slide centers, and the
 * transition slides continuously as you swipe (rather than snapping).
 */
function Dot({ index, scrollX, width }: DotProps) {
  const style = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width]
    return {
      width: interpolate(
        scrollX.value,
        inputRange,
        [DOT_INACTIVE_WIDTH, DOT_ACTIVE_WIDTH, DOT_INACTIVE_WIDTH],
        Extrapolation.CLAMP
      ),
      opacity: interpolate(
        scrollX.value,
        inputRange,
        [0.4, 1, 0.4],
        Extrapolation.CLAMP
      ),
    }
  })

  return (
    <Animated.View className="h-2 mx-1 rounded-full bg-white" style={style} />
  )
}

interface PhotoCarouselDotsProps {
  count: number
  scrollX: SharedValue<number>
  width: number
  testID?: string
}

export function PhotoCarouselDots({
  count,
  scrollX,
  width,
  testID,
}: PhotoCarouselDotsProps) {
  return (
    <View className="flex-row items-center justify-center" testID={testID}>
      {pipe(
        Array.range(0, count - 1),
        Array.map((index) => (
          <Dot key={index} index={index} scrollX={scrollX} width={width} />
        ))
      )}
    </View>
  )
}
