import { Option, pipe } from 'effect'
import { useEffect, useRef } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { useToast } from 'src/contexts/ToastContext'
import { fonts } from 'src/theme'

const TOAST_HEIGHT = 56
const ANIMATION_DURATION = 200

export function Toast() {
  const { state } = useToast()
  const translateY = useRef(new Animated.Value(TOAST_HEIGHT + 20)).current

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: state.visible ? 0 : TOAST_HEIGHT + 20,
      duration: ANIMATION_DURATION,
      useNativeDriver: true,
    }).start()
  }, [state.visible, translateY])

  if (!state.visible && !state.message) {
    return null
  }

  return (
    <Animated.View
      className="absolute bottom-4 left-4 right-4"
      style={{
        transform: [{ translateY }],
      }}
    >
      <View className="bg-slate-800 rounded-xl px-4 py-3 flex-row items-center justify-between min-h-[56px]">
        <Text
          className="text-white text-sm flex-1 mr-3"
          style={{ fontFamily: fonts.medium }}
          numberOfLines={2}
        >
          {state.message}
        </Text>
        {pipe(
          state.action,
          Option.match({
            onNone: () => null,
            onSome: (action) => (
              <Pressable
                onPress={action.onPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text
                  className="text-primary text-sm uppercase"
                  style={{ fontFamily: fonts.semiBold }}
                >
                  {action.label}
                </Text>
              </Pressable>
            ),
          })
        )}
      </View>
    </Animated.View>
  )
}
