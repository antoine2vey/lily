import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const SCREEN_HEIGHT = Dimensions.get('window').height

interface BottomSheetProps {
  visible: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  snapPoints?: (string | number)[]
}

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  snapPoints = ['50%'],
}: BottomSheetProps) {
  const insets = useSafeAreaInsets()
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current

  const getSnapPointValue = useCallback(
    (snapPoint: string | number): number => {
      if (typeof snapPoint === 'number') {
        return SCREEN_HEIGHT - snapPoint
      }
      const percentage = Number.parseInt(snapPoint.replace('%', ''), 10) / 100
      return SCREEN_HEIGHT - SCREEN_HEIGHT * percentage
    },
    []
  )

  const sheetHeight = SCREEN_HEIGHT - getSnapPointValue(snapPoints[0])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy)
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          handleClose()
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start()
        }
      },
    })
  ).current

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose()
    })
  }, [onClose, translateY, backdropOpacity])

  useEffect(() => {
    if (visible) {
      translateY.setValue(SCREEN_HEIGHT)
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [visible, translateY, backdropOpacity])

  if (!visible) {
    return null
  }

  return (
    <Modal transparent visible={visible} onRequestClose={handleClose}>
      <View className="flex-1">
        <Animated.View
          className="absolute inset-0"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            opacity: backdropOpacity,
          }}
        >
          <Pressable className="flex-1" onPress={handleClose} />
        </Animated.View>
        <Animated.View
          className="absolute left-0 right-0 bottom-0 bg-white"
          style={{
            height: sheetHeight + insets.bottom,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            transform: [{ translateY }],
            paddingBottom: insets.bottom,
          }}
        >
          <View
            {...panResponder.panHandlers}
            className="items-center pt-2 pb-4"
          >
            <View className="w-9 h-1 rounded-full bg-slate-300" />
          </View>
          {title && (
            <View className="px-6 pb-4 border-b border-border">
              <Text className="text-lg text-center text-text-primary font-semibold">
                {title}
              </Text>
            </View>
          )}
          <View className="flex-1 px-6">{children}</View>
        </Animated.View>
      </View>
    </Modal>
  )
}
