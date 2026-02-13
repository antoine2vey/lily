import { ActivityIndicator, Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

interface ToolLoadingIndicatorProps {
  label: string
}

export function ToolLoadingIndicator({ label }: ToolLoadingIndicatorProps) {
  const iconColors = useIconColors()

  return (
    <View className="flex-row items-center py-2">
      <ActivityIndicator size="small" color={iconColors.primary} />
      <Text className="text-sm text-text-muted dark:text-slate-400 ml-2 font-regular">
        {label}
      </Text>
    </View>
  )
}
