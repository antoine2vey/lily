import { MaterialIcons } from '@expo/vector-icons'
import { Text, View } from 'react-native'
import { colors, fonts } from 'src/theme'

interface StatsRowProps {
  total: number
  healthy: number
  attention: number
}

interface StatBoxProps {
  value: number
  label: string
  variant?: 'default' | 'healthy' | 'warning'
  showWarningIcon?: boolean
}

function StatBox({
  value,
  label,
  variant = 'default',
  showWarningIcon = false,
}: StatBoxProps) {
  const valueColor =
    variant === 'healthy'
      ? colors.primary
      : variant === 'warning' && value > 0
        ? colors.warning
        : colors.textPrimary

  const borderColor =
    variant === 'warning' && value > 0 ? 'rgba(245, 158, 11, 0.2)' : '#F3F4F6'

  return (
    <View
      className="flex-1 bg-white rounded-[20px] py-4 px-2 items-center justify-center"
      style={{
        borderWidth: 1,
        borderColor,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 2,
        elevation: 1,
      }}
    >
      <View className="flex-row items-center gap-1 mb-1">
        <Text
          className="text-2xl"
          style={{
            fontFamily: fonts.bold,
            color: valueColor,
          }}
        >
          {value}
        </Text>
        {showWarningIcon && value > 0 && (
          <MaterialIcons
            name="warning"
            size={16}
            color={colors.warning}
            testID="attention-warning-icon"
          />
        )}
      </View>
      <Text
        className="text-[10px] uppercase tracking-wider"
        style={{
          fontFamily: fonts.bold,
          color: '#9CA3AF',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
    </View>
  )
}

export function StatsRow({ total, healthy, attention }: StatsRowProps) {
  return (
    <View className="flex-row gap-3">
      <StatBox value={total} label="Total" />
      <StatBox value={healthy} label="Healthy" variant="healthy" />
      <StatBox
        value={attention}
        label="Attention"
        variant="warning"
        showWarningIcon
      />
    </View>
  )
}
