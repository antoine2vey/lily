import { Text, View } from 'react-native'
import { Button } from 'src/components/ui/Button'

type IllustrationType = 'plant' | 'notification' | 'achievement' | 'search'

interface EmptyStateProps {
  illustration?: IllustrationType
  title: string
  description?: string
  action?: {
    label: string
    onPress: () => void
  }
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-6 py-8">
      <Text className="text-2xl text-center mb-2 text-text-primary dark:text-white font-semibold">
        {title}
      </Text>
      {description && (
        <Text className="text-base text-center mb-6 text-text-muted dark:text-slate-400 font-regular">
          {description}
        </Text>
      )}
      {action && (
        <View className="w-full">
          <Button onPress={action.onPress}>{action.label}</Button>
        </View>
      )}
    </View>
  )
}
