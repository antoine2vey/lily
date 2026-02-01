import { MaterialIcons } from '@expo/vector-icons'
import { Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

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
  const iconColors = useIconColors()

  const valueColorClass =
    variant === 'healthy'
      ? 'text-primary'
      : variant === 'warning' && value > 0
        ? 'text-warning'
        : 'text-text-primary dark:text-white'

  const borderColorClass =
    variant === 'warning' && value > 0
      ? 'border-warning/20'
      : 'border-slate-100 dark:border-slate-700'

  return (
    <View
      className={`flex-1 bg-white dark:bg-surface-dark rounded-[20px] py-4 px-2 items-center justify-center border ${borderColorClass}`}
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 2,
        elevation: 1,
      }}
    >
      <View className="flex-row items-center gap-1 mb-1">
        <Text className={`text-2xl font-bold ${valueColorClass}`}>{value}</Text>
        {showWarningIcon && value > 0 && (
          <MaterialIcons
            name="warning"
            size={16}
            color={iconColors.warning}
            testID="attention-warning-icon"
          />
        )}
      </View>
      <Text className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
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
