import { MaterialIcons } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'

interface ChatCTAProps {
  plantName: string
  onPress: () => void
}

export function ChatCTA({ plantName, onPress }: ChatCTAProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-primary active:bg-primary-dark rounded-2xl py-4 px-5"
      testID="chat-cta"
    >
      <View className="w-11 h-11 rounded-full bg-white/20 items-center justify-center mr-4">
        <MaterialIcons name="chat" size={22} color="#FFFFFF" />
      </View>
      <View className="flex-1">
        <Text className="text-white text-base font-semibold">
          Ask about {plantName}
        </Text>
        <Text className="text-white/80 text-sm font-regular mt-0.5">
          Get personalized care tips
        </Text>
      </View>
      <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
    </Pressable>
  )
}
