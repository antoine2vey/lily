import type { Orientation } from '@lily/shared'
import { Array } from 'effect'
import { Text, View } from 'react-native'
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated'
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg'
import { useIconColors } from '@/hooks/useIconColors'

interface CardinalLabel {
  label: string
  degrees: number
}

const CARDINALS: readonly CardinalLabel[] = [
  { label: 'N', degrees: 0 },
  { label: 'E', degrees: 90 },
  { label: 'S', degrees: 180 },
  { label: 'W', degrees: 270 },
]

const TICKS = Array.range(0, 11)

interface CompassDialProps {
  rotation: SharedValue<number>
  orientation: Orientation | null
  /** Diameter in px. */
  size?: number
}

/**
 * iOS-Compass-style dial. The rose rotates by `-heading` so that real north
 * stays aligned with true north as the phone turns, and a FIXED pointer at the
 * top marks the direction the phone's top edge faces. The fixed center readout
 * shows the snapped cardinal direction the phone is facing.
 *
 * Standard pattern (matches react-native-compass-heading / iOS Compass):
 * rotate the whole rose by the negative heading; the cardinal under the pointer
 * is where you're facing. `rotation` accumulates shortest-path for smoothness.
 */
export function CompassDial({
  rotation,
  orientation,
  size = 120,
}: CompassDialProps) {
  const iconColors = useIconColors()

  const center = size / 2
  const radius = center - size * 0.05
  const labelRadius = radius - size * 0.13
  const labelFont = Math.max(9, Math.round(size * 0.12))
  const dirFont = Math.max(16, Math.round(size * 0.24))

  const roseStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-rotation.value}deg` }],
  }))

  return (
    <View
      className="items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Rotating rose — north tracks real north */}
      <Animated.View style={roseStyle}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={iconColors.border}
            strokeWidth={1.5}
            fill="none"
          />
          {Array.map(TICKS, (i) => {
            const angle = (i * 30 * Math.PI) / 180
            const isCardinal = i % 3 === 0
            const inner = isCardinal
              ? radius - size * 0.08
              : radius - size * 0.04
            const x1 = center + Math.sin(angle) * radius
            const y1 = center - Math.cos(angle) * radius
            const x2 = center + Math.sin(angle) * inner
            const y2 = center - Math.cos(angle) * inner
            return (
              <Line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isCardinal ? iconColors.primary : iconColors.textMuted}
                strokeWidth={isCardinal ? 2 : 1}
              />
            )
          })}
          {Array.map(CARDINALS, (c) => {
            const angle = (c.degrees * Math.PI) / 180
            const x = center + Math.sin(angle) * labelRadius
            const y = center - Math.cos(angle) * labelRadius
            return (
              <SvgText
                key={c.label}
                x={x}
                y={y + labelFont / 3}
                fontSize={labelFont}
                fontWeight="bold"
                textAnchor="middle"
                fill={
                  c.label === 'N' ? iconColors.primary : iconColors.textMuted
                }
              >
                {c.label}
              </SvgText>
            )
          })}
        </Svg>
      </Animated.View>

      {/* Fixed pointer — the direction the phone's top edge faces */}
      <View
        className="absolute top-0"
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: size * 0.06,
          borderRightWidth: size * 0.06,
          borderTopWidth: size * 0.09,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: iconColors.primary,
        }}
      />

      {/* Fixed readout — the snapped cardinal direction */}
      <View className="absolute items-center justify-center">
        <Text className="font-bold text-primary" style={{ fontSize: dirFont }}>
          {orientation ?? '—'}
        </Text>
      </View>
    </View>
  )
}
