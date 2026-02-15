import { Stack, useLocalSearchParams } from 'expo-router'
import { Text, View } from 'react-native'

export default function PublicProfile() {
  const { userId } = useLocalSearchParams<{ userId: string }>()

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-background dark:bg-background-dark items-center justify-center">
        <Text className="text-text-primary dark:text-white">
          Profile: {userId}
        </Text>
      </View>
    </>
  )
}
