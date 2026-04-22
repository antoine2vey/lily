import { Pressable, Text, View } from 'react-native'

interface SectionHeaderProps {
  title: string
  action?: {
    label: string
    onPress: () => void
    testID?: string
  }
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-lg text-text-primary dark:text-white font-semibold">
        {title}
      </Text>
      {action && (
        <Pressable
          testID={action.testID}
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
