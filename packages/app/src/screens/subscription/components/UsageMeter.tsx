import { MaterialIcons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { Text, View } from 'react-native'
import { iconColors } from 'src/theme'

interface UsageMeterProps {
  icon: ComponentProps<typeof MaterialIcons>['name']
  label: string
  current: number
  max: number
}

export function UsageMeter({ icon, label, current, max }: UsageMeterProps) {
  const progress = Math.min(current / max, 1)
  const isAtLimit = current >= max

  return (
    <View className="mb-4">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center">
          <MaterialIcons
            name={icon}
            size={18}
            color={iconColors.primary}
            style={{ marginRight: 8 }}
          />
          <Text className="text-sm font-medium text-text-primary">{label}</Text>
        </View>
        <Text
          className={`text-sm font-semibold ${isAtLimit ? 'text-coral' : 'text-text-primary'}`}
        >
          {current}/{max}
        </Text>
      </View>
      <View className="h-2 rounded-full overflow-hidden bg-border">
        <View
          className={`h-full rounded-full ${isAtLimit ? 'bg-coral' : 'bg-primary'}`}
          style={{ width: `${progress * 100}%` }}
        />
      </View>
    </View>
  )
}
