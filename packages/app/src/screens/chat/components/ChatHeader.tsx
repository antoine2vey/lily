import { MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { Avatar } from 'src/components/Avatar'
import { iconColors } from 'src/theme'

export function ChatHeader() {
  return (
    <View className="flex-row items-center px-4 py-3 border-b bg-surface border-border">
      <Pressable
        onPress={() => router.back()}
        className="w-10 h-10 items-center justify-center"
      >
        <MaterialIcons
          name="arrow-back"
          size={24}
          color={iconColors.textPrimary}
        />
      </Pressable>

      <View className="flex-1 flex-row items-center ml-2">
        <Avatar name="Lily" size="md" />
        <View className="ml-3">
          <Text className="text-base font-semibold text-text-primary">
            Lily Assistant
          </Text>
          <View className="flex-row items-center">
            <View className="w-2 h-2 rounded-full mr-1.5 bg-primary" />
            <Text className="text-xs font-regular text-text-muted">Online</Text>
          </View>
        </View>
      </View>

      <Pressable className="w-10 h-10 items-center justify-center">
        <MaterialIcons
          name="more-vert"
          size={24}
          color={iconColors.textPrimary}
        />
      </Pressable>
    </View>
  )
}
