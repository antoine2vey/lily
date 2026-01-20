import { Pressable, Text, View } from 'react-native'
import { colors, fonts } from 'src/theme'

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
      <Text
        className="text-lg text-text-primary"
        style={{ fontFamily: fonts.semiBold }}
      >
        {title}
      </Text>
      {action && (
        <Pressable
          onPress={action.onPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text
            className="text-sm"
            style={{ fontFamily: fonts.regular, color: colors.primary }}
          >
            {action.label}
          </Text>
        </Pressable>
      )}
    </View>
  )
}
