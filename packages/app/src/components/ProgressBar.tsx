import { Number as EffectNumber } from 'effect'
import { Text, View } from 'react-native'
import { iconColors } from 'src/theme'

interface ProgressBarProps {
  progress: number
  label?: string
  color?: string
  height?: number
  showPercentage?: boolean
  testID?: string
}

export function ProgressBar({
  progress,
  label,
  color = iconColors.primary,
  height = 8,
  showPercentage = false,
  testID,
}: ProgressBarProps) {
  const clampedProgress = EffectNumber.clamp(progress, {
    minimum: 0,
    maximum: 1,
  })
  const percentage = Math.round(clampedProgress * 100)

  return (
    <View testID={testID} className="w-full">
      {(label || showPercentage) && (
        <View className="flex-row justify-between mb-2">
          {label && (
            <Text className="text-sm text-text-muted font-regular">
              {label}
            </Text>
          )}
          {showPercentage && (
            <Text className="text-sm text-text-muted font-medium">
              {percentage}%
            </Text>
          )}
        </View>
      )}
      <View
        className="w-full rounded-full overflow-hidden bg-slate-200"
        style={{ height }}
      >
        <View
          className="h-full rounded-full"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  )
}
