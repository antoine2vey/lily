import { Pressable, Text, View } from 'react-native'

interface SectionHeaderProps {
  title: string
  action?: {
    label: string
    onPress: () => void
  }
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-lg text-text-primary font-semibold">{title}</Text>
      {action && (
        <Pressable
          onPress={action.onPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text className="text-sm text-primary font-regular">
            {action.label}
          </Text>
        </Pressable>
      )}
    </View>
  )
}
