import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function CareScreen() {
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
          Care Tasks
        </Text>
        <Text
          className="text-sm text-text-secondary mt-2 text-center"
          style={{ fontFamily: 'PlusJakartaSans_400Regular' }}
        >
          Your care schedule will appear here
        </Text>
      </View>
    </SafeAreaView>
  )
}
