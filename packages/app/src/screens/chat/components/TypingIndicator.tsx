import { useEffect, useRef } from 'react'
import { Animated, View } from 'react-native'
import { Avatar } from 'src/components/Avatar'
import { iconColors } from 'src/theme'

export function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current
  const dot2 = useRef(new Animated.Value(0)).current
  const dot3 = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const createAnimation = (value: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      )
    }

    const animation = Animated.parallel([
      createAnimation(dot1, 0),
      createAnimation(dot2, 200),
      createAnimation(dot3, 400),
    ])

    animation.start()

    return () => {
      animation.stop()
    }
  }, [dot1, dot2, dot3])

  const getAnimatedStyle = (value: Animated.Value) => ({
    transform: [
      {
        translateY: value.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -4],
        }),
      },
    ],
    opacity: value.interpolate({
      inputRange: [0, 1],
      outputRange: [0.5, 1],
    }),
  })

  return (
    <View className="flex-row items-start mb-4">
      <View className="mr-2 mt-1">
        <Avatar name="Lily" size="sm" />
      </View>
      <View
        className="px-4 py-3 rounded-2xl flex-row items-center bg-primary-tint"
        style={{
          borderTopLeftRadius: 4,
        }}
      >
        <Animated.View
          className="w-2 h-2 rounded-full mr-1 bg-primary"
          style={[getAnimatedStyle(dot1)]}
        />
        <Animated.View
          className="w-2 h-2 rounded-full mr-1 bg-primary"
          style={[getAnimatedStyle(dot2)]}
        />
        <Animated.View
          className="w-2 h-2 rounded-full bg-primary"
          style={[getAnimatedStyle(dot3)]}
        />
      </View>
    </View>
  )
}
