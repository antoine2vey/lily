import { useEffect, useRef } from 'react'
import { Animated, View } from 'react-native'
import { Avatar } from 'src/components/Avatar'

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
    <View className="flex-row items-end mb-4">
      <View className="mr-3 mb-1">
        <Avatar name="Lily" size="sm" />
      </View>
      <View
        className="h-10 px-4 rounded-2xl flex-row items-center gap-1.5 bg-primary-tint dark:bg-primary/20"
        style={{
          borderBottomLeftRadius: 4,
        }}
      >
        <Animated.View
          className="w-1.5 h-1.5 rounded-full bg-primary/60"
          style={[getAnimatedStyle(dot1)]}
        />
        <Animated.View
          className="w-1.5 h-1.5 rounded-full bg-primary/60"
          style={[getAnimatedStyle(dot2)]}
        />
        <Animated.View
          className="w-1.5 h-1.5 rounded-full bg-primary/60"
          style={[getAnimatedStyle(dot3)]}
        />
      </View>
    </View>
  )
}
