import { Number as EffectNumber } from 'effect'
import type { ReactNode } from 'react'
import { useCallback, useRef } from 'react'
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  PanResponder,
  Text,
  View,
} from 'react-native'
import { colors, fonts } from 'src/theme'

interface SliderProps {
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  minLabel?: string
  maxLabel?: string
  valueLabel?: string
  icon?: ReactNode
  label?: string
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  minLabel,
  maxLabel,
  valueLabel,
  icon,
  label,
}: SliderProps) {
  const trackWidth = useRef(0)
  const trackRef = useRef<View>(null)

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    trackWidth.current = event.nativeEvent.layout.width
  }, [])

  const calculateValue = useCallback(
    (locationX: number): number => {
      const width = trackWidth.current
      if (width === 0) return value

      const ratio = EffectNumber.clamp(locationX / width, {
        minimum: 0,
        maximum: 1,
      })
      const rawValue = min + ratio * (max - min)
      const steppedValue = Math.round(rawValue / step) * step
      return EffectNumber.clamp(steppedValue, { minimum: min, maximum: max })
    },
    [min, max, step, value]
  )

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event: GestureResponderEvent) => {
        const newValue = calculateValue(event.nativeEvent.locationX)
        onValueChange(newValue)
      },
      onPanResponderMove: (event: GestureResponderEvent) => {
        const newValue = calculateValue(event.nativeEvent.locationX)
        onValueChange(newValue)
      },
    })
  ).current

  const normalizedValue = (value - min) / (max - min)
  const percentage = EffectNumber.clamp(normalizedValue * 100, {
    minimum: 0,
    maximum: 100,
  })

  return (
    <View className="w-full">
      {(icon || label || valueLabel) && (
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            {icon}
            {label && (
              <Text
                className="text-base"
                style={{ fontFamily: fonts.medium, color: colors.textPrimary }}
              >
                {label}
              </Text>
            )}
          </View>
          {valueLabel && (
            <Text
              className="text-xs"
              style={{ fontFamily: fonts.medium, color: colors.primary }}
            >
              {valueLabel}
            </Text>
          )}
        </View>
      )}
      <View
        ref={trackRef}
        onLayout={handleLayout}
        className="h-6 justify-center"
        {...panResponder.panHandlers}
      >
        <View
          className="w-full h-1.5 rounded-full"
          style={{ backgroundColor: '#E0E0E0' }}
        >
          <View
            className="h-full rounded-full"
            style={{
              width: `${percentage}%`,
              backgroundColor: colors.primary,
            }}
          />
        </View>
        <View
          className="absolute w-6 h-6 rounded-full items-center justify-center"
          style={{
            left: `${percentage}%`,
            marginLeft: -12,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: colors.white,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 4,
            elevation: 3,
          }}
        />
      </View>
      {(minLabel || maxLabel) && (
        <View className="flex-row justify-between mt-1">
          <Text
            className="text-xs"
            style={{ fontFamily: fonts.regular, color: colors.textMuted }}
          >
            {minLabel}
          </Text>
          <Text
            className="text-xs"
            style={{ fontFamily: fonts.regular, color: colors.textMuted }}
          >
            {maxLabel}
          </Text>
        </View>
      )}
    </View>
  )
}
