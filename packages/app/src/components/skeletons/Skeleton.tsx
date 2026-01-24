import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

interface SkeletonProps {
  className?: string
  width?: number | string
  height?: number | string
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  children?: React.ReactNode
}

const roundedMap = {
  none: '',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
}

export function Skeleton({
  className = '',
  width,
  height,
  rounded = 'md',
  children,
}: SkeletonProps) {
  const opacity = useSharedValue(0.3)

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.7, { duration: 800 }), -1, true)
  }, [opacity])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  const style: Record<string, unknown> = {}
  if (width !== undefined) style.width = width
  if (height !== undefined) style.height = height

  return (
    <Animated.View
      style={[animatedStyle, style]}
      className={`bg-gray-200 ${roundedMap[rounded]} ${className}`}
    >
      {children}
    </Animated.View>
  )
}

interface SkeletonTextProps {
  lines?: number
  lastLineWidth?: string
  className?: string
}

const LINE_KEYS = ['line-a', 'line-b', 'line-c', 'line-d', 'line-e']

export function SkeletonText({
  lines = 1,
  lastLineWidth = '75%',
  className = '',
}: SkeletonTextProps) {
  return (
    <View className={`gap-2 ${className}`}>
      {LINE_KEYS.slice(0, lines).map((key, index) => {
        const isLast = index === lines - 1 && lines > 1
        return (
          <Skeleton
            key={key}
            height={14}
            rounded="sm"
            className={isLast ? '' : 'w-full'}
            width={isLast ? lastLineWidth : undefined}
          />
        )
      })}
    </View>
  )
}

interface SkeletonCircleProps {
  size?: number
  className?: string
}

export function SkeletonCircle({
  size = 40,
  className = '',
}: SkeletonCircleProps) {
  return (
    <Skeleton width={size} height={size} rounded="full" className={className} />
  )
}

interface SkeletonBoxProps {
  width?: number | string
  height?: number | string
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  className?: string
}

export function SkeletonBox({
  width,
  height,
  rounded = 'md',
  className = '',
}: SkeletonBoxProps) {
  return (
    <Skeleton
      width={width}
      height={height}
      rounded={rounded}
      className={className}
    />
  )
}
