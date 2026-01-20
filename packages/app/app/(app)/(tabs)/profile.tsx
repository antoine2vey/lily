import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ProfileScreen() {
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1 bg-background"
    >
      <View className="flex-1 items-center justify-center px-4">
        <Text
          className="text-xl text-text-primary"
          style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
        >
          Profile
        </Text>
        <Text
          className="text-sm text-text-secondary mt-2 text-center"
          style={{ fontFamily: 'PlusJakartaSans_400Regular' }}
        >
          Your profile and settings will appear here
        </Text>
      </View>
    </SafeAreaView>
  )
}
