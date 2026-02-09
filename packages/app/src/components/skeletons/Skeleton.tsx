import { type DimensionValue, useColorScheme } from 'react-native'
import { ShimmerEffect } from '@/components/ui/shimmer/Shimmer'

const ROUNDED_VALUES: Record<string, number> = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  full: 9999,
}

const LIGHT_SHIMMER_COLORS = [
  'transparent',
  'rgba(255,255,255,0.4)',
  'rgba(255,255,255,0.7)',
  'rgba(255,255,255,0.4)',
  'transparent',
]

const DARK_SHIMMER_COLORS = [
  'transparent',
  'rgba(100,116,139,0.3)',
  'rgba(148,163,184,0.4)',
  'rgba(100,116,139,0.3)',
  'transparent',
]

const LIGHT_BG = '#D1D5DB'
const DARK_BG = '#334155'

interface SkeletonProps {
  className?: string
  width?: number | string
  height?: number | string
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  children?: React.ReactNode
}

export function Skeleton({
  className = '',
  width,
  height,
  rounded = 'md',
  children,
}: SkeletonProps) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <ShimmerEffect
      isLoading
      preset="custom"
      shimmerColors={isDark ? DARK_SHIMMER_COLORS : LIGHT_SHIMMER_COLORS}
      className={className}
      style={{
        width: width as DimensionValue,
        height: height as DimensionValue,
        borderRadius: ROUNDED_VALUES[rounded],
        backgroundColor: isDark ? DARK_BG : LIGHT_BG,
      }}
    >
      {children}
    </ShimmerEffect>
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
