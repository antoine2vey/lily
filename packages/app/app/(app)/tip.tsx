import { router, useLocalSearchParams } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

export default function TipRoute() {
  const { title, body } = useLocalSearchParams<{
    title: string
    body: string
  }>()

  const handleClose = () => {
    router.back()
  }

  return (
    <Pressable className="flex-1 bg-black/40" onPress={handleClose}>
      <View className="flex-1 justify-center px-6">
        <Pressable
          className="bg-surface rounded-xl p-6"
          onPress={(e) => e.stopPropagation()}
        >
          {title ? (
            <Text
              className="text-lg text-text-primary mb-3"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            >
              {title}
            </Text>
          ) : null}
          {body ? (
            <Text
              className="text-base text-text-secondary leading-6"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
            >
              {body}
            </Text>
          ) : null}
          <Pressable
            className="bg-primary rounded-xl py-3 mt-5"
            onPress={handleClose}
          >
            <Text
              className="text-white text-base text-center"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            >
              Got it
            </Text>
          </Pressable>
        </Pressable>
      </View>
    </Pressable>
  )
}
