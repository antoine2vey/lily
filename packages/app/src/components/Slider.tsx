import RNSlider from '@react-native-community/slider'
import { Option, pipe } from 'effect'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

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
  iconBgColor?: string
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
  iconBgColor,
  label,
}: SliderProps) {
  const iconColors = useIconColors()
  const resolvedIconBgColor = pipe(
    Option.fromNullable(iconBgColor),
    Option.getOrElse(() => iconColors.surfaceTinted)
  )

  return (
    <View className="w-full gap-4">
      {(icon || label || valueLabel) && (
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            {icon && (
              <View
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: resolvedIconBgColor }}
              >
                {icon}
              </View>
            )}
            {label && (
              <Text className="text-base font-bold text-text-primary dark:text-white">
                {label}
              </Text>
            )}
          </View>
          {valueLabel && (
            <Text className="text-xs font-medium text-primary dark:text-primary-light">
              {valueLabel}
            </Text>
          )}
        </View>
      )}
      <RNSlider
        value={value}
        onValueChange={onValueChange}
        minimumValue={min}
        maximumValue={max}
        step={step}
        minimumTrackTintColor={iconColors.primary}
        maximumTrackTintColor={iconColors.surfaceTinted}
        thumbTintColor={iconColors.primary}
        style={{ height: 40 }}
      />
      {(minLabel || maxLabel) && (
        <View className="flex-row justify-between -mt-2">
          <Text className="text-xs font-medium text-text-muted dark:text-slate-400">
            {minLabel}
          </Text>
          <Text className="text-xs font-medium text-text-muted dark:text-slate-400">
            {maxLabel}
          </Text>
        </View>
      )}
    </View>
  )
}
