import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { Text, View } from 'react-native'
import { iconColors } from 'src/theme'
import { Button } from './ui/Button'

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

const getIllustrationIcon = (
  type: IllustrationType
): keyof typeof MaterialIcons.glyphMap =>
  pipe(
    Match.value(type),
    Match.when('plant', () => 'local-florist' as const),
    Match.when('notification', () => 'notifications-none' as const),
    Match.when('achievement', () => 'emoji-events' as const),
    Match.when('search', () => 'search' as const),
    Match.exhaustive
  )

export function EmptyState({
  illustration = 'plant',
  title,
  description,
  action,
}: EmptyStateProps) {
  const iconName = getIllustrationIcon(illustration)

  return (
    <View className="flex-1 items-center justify-center px-6 py-8">
      <View className="w-32 h-32 rounded-full items-center justify-center mb-6 bg-primary-tint">
        <MaterialIcons name={iconName} size={64} color={iconColors.primary} />
      </View>
      <Text className="text-2xl text-center mb-2 text-text-primary font-semibold">
        {title}
      </Text>
      {description && (
        <Text className="text-base text-center mb-6 text-text-muted font-regular">
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
