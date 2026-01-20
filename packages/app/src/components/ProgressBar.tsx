import { Number as EffectNumber } from 'effect'
import { Text, View } from 'react-native'
import { colors, fonts } from 'src/theme'

interface ProgressBarProps {
  progress: number
  label?: string
  color?: string
  height?: number
  showPercentage?: boolean
}

export function ProgressBar({
  progress,
  label,
  color = colors.primary,
  height = 8,
  showPercentage = false,
}: ProgressBarProps) {
  const clampedProgress = EffectNumber.clamp(progress, {
    minimum: 0,
    maximum: 1,
  })
  const percentage = Math.round(clampedProgress * 100)

  return (
    <View className="w-full">
      {(label || showPercentage) && (
        <View className="flex-row justify-between mb-2">
          {label && (
            <Text
              className="text-sm"
              style={{ fontFamily: fonts.regular, color: colors.textMuted }}
            >
              {label}
            </Text>
          )}
          {showPercentage && (
            <Text
              className="text-sm"
              style={{ fontFamily: fonts.medium, color: colors.textMuted }}
            >
              {percentage}%
            </Text>
          )}
        </View>
      )}
      <View
        className="w-full rounded-full overflow-hidden"
        style={{
          height,
          backgroundColor: '#E0E0E0',
        }}
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
