import { useCallback, useRef } from 'react'
import { PanResponder, View } from 'react-native'
import Animated, {
  runOnJS,
  type ScrollHandlerProcessed,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useIconColors } from 'src/hooks/useIconColors'
import { CircularLoader } from '@/components/ui/circular-loader'

const MAX_PULL = 100
const REFRESH_THRESHOLD = 60
const LOADER_HEIGHT = 48

interface PullToRefreshProps {
  isRefreshing: boolean
  onRefresh: () => void
  children: (
    scrollHandler: ScrollHandlerProcessed<Record<string, unknown>>
  ) => React.ReactNode
}

export function PullToRefresh({
  isRefreshing,
  onRefresh,
  children,
}: PullToRefreshProps) {
  const iconColors = useIconColors()
  const scrollY = useSharedValue(0)
  const pullDistance = useSharedValue(0)
  const isRefreshingRef = useRef(isRefreshing)
  isRefreshingRef.current = isRefreshing

  const triggerRefresh = useCallback(() => {
    if (!isRefreshingRef.current) {
      onRefresh()
    }
  }, [onRefresh])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (_, gestureState) =>
        scrollY.value <= 0 && gestureState.dy > 0,
      onMoveShouldSetPanResponderCapture: (_, gestureState) =>
        scrollY.value <= 0 && gestureState.dy > 0,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0 && !isRefreshingRef.current) {
          pullDistance.value = Math.min(gestureState.dy * 0.5, MAX_PULL)
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy * 0.5 >= REFRESH_THRESHOLD) {
          pullDistance.value = withTiming(LOADER_HEIGHT)
          runOnJS(triggerRefresh)()
        } else {
          pullDistance.value = withTiming(0)
        }
      },
    })
  ).current

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y
    },
  })

  if (!isRefreshing && pullDistance.value > 0) {
    pullDistance.value = withTiming(0)
  }

  const loaderStyle = useAnimatedStyle(() => ({
    height: pullDistance.value,
    opacity: pullDistance.value / REFRESH_THRESHOLD,
  }))

  return (
    <View className="flex-1" {...panResponder.panHandlers}>
      <Animated.View
        style={loaderStyle}
        className="items-center justify-center overflow-hidden"
      >
        <CircularLoader
          size={28}
          strokeWidth={3}
          activeColor={iconColors.primary}
        />
      </Animated.View>
      {children(scrollHandler)}
    </View>
  )
}
