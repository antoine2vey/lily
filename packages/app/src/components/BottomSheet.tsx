import { MaterialIcons } from '@expo/vector-icons'
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
import { useIconColors } from 'src/hooks/useIconColors'

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
  const iconColors = useIconColors()
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
          className="absolute left-0 right-0 bottom-0 bg-white dark:bg-surface-dark"
          style={{
            height: sheetHeight + insets.bottom,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            transform: [{ translateY }],
            paddingBottom: insets.bottom,
          }}
        >
          {/* Drag Handle */}
          <View
            {...panResponder.panHandlers}
            className="items-center pt-3 pb-1"
          >
            <View className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
          </View>
          {/* Header */}
          {title && (
            <View className="px-6 py-4 flex-row items-center justify-between">
              <Text className="text-2xl text-text-primary dark:text-white font-bold tracking-tight">
                {title}
              </Text>
              <Pressable
                onPress={handleClose}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 items-center justify-center"
              >
                <MaterialIcons
                  name="close"
                  size={20}
                  color={iconColors.textSecondary}
                />
              </Pressable>
            </View>
          )}
          {/* Content */}
          <View className="flex-1 px-5 pb-10">{children}</View>
        </Animated.View>
      </View>
    </Modal>
  )
}
