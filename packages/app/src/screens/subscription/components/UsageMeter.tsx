import { MaterialIcons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

interface UsageMeterProps {
  icon: ComponentProps<typeof MaterialIcons>['name']
  label: string
  current: number
  max: number
}

export function UsageMeter({ icon, label, current, max }: UsageMeterProps) {
  const iconColors = useIconColors()
  const progress = Math.min(current / max, 1)
  const isAtLimit = current >= max

  return (
    <View className="gap-2">
      <View className="flex-row items-end justify-between">
        <View className="flex-row items-center gap-2">
          <MaterialIcons
            name={icon}
            size={18}
            color={iconColors.textSecondary}
          />
          <Text className="text-sm font-semibold text-text-secondary dark:text-slate-300">
            {label}
          </Text>
        </View>
        <Text
          className={`text-sm font-bold ${isAtLimit ? 'text-error' : 'text-text-primary dark:text-white'}`}
        >
          {current}/{max}
        </Text>
      </View>
      <View className="h-2.5 rounded-full overflow-hidden bg-surface-tinted dark:bg-slate-700">
        <View
          className={`h-full rounded-full ${isAtLimit ? 'bg-error' : 'bg-primary'}`}
          style={{ width: `${progress * 100}%` }}
        />
      </View>
    </View>
  )
}
