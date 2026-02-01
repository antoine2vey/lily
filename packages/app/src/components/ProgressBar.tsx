import { Number as EffectNumber } from 'effect'
import { Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

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
  color,
  height = 8,
  showPercentage = false,
  testID,
}: ProgressBarProps) {
  const iconColors = useIconColors()
  const barColor = color ?? iconColors.primary

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
        <View
          className="h-full rounded-full"
          style={{
            width: `${percentage}%`,
            backgroundColor: barColor,
          }}
        />
      </View>
    </View>
  )
}
