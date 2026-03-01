import { MaterialIcons } from '@expo/vector-icons'
import type { PublicPlantPreview } from '@lily/shared'
import { Option, pipe } from 'effect'
import { Image } from 'expo-image'
import { useEffect } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

interface PlantPreviewModalProps {
  plant: PublicPlantPreview | null
  ownerName: string
  visible: boolean
  onClose: () => void
}

interface ZoomableImageProps {
  imageUrl: string | null
  visible: boolean
}

function ZoomableImage({ imageUrl, visible }: ZoomableImageProps) {
  const scale = useSharedValue(1)
  const baseScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const baseTranslateX = useSharedValue(0)
  const baseTranslateY = useSharedValue(0)

  useEffect(() => {
    if (!visible) {
      scale.value = 1
      baseScale.value = 1
      translateX.value = 0
      translateY.value = 0
      baseTranslateX.value = 0
      baseTranslateY.value = 0
    }
  }, [
    visible,
    scale,
    baseScale,
    translateX,
    translateY,
    baseTranslateX,
    baseTranslateY,
  ])

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = baseScale.value * e.scale
      scale.value = Math.min(Math.max(next, 1), 5)
    })
    .onEnd(() => {
      baseScale.value = scale.value
    })

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value <= 1) return
      translateX.value = baseTranslateX.value + e.translationX
      translateY.value = baseTranslateY.value + e.translationY
    })
    .onEnd(() => {
      baseTranslateX.value = translateX.value
      baseTranslateY.value = translateY.value
    })

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withSpring(1)
      baseScale.value = 1
      translateX.value = withSpring(0)
      translateY.value = withSpring(0)
      baseTranslateX.value = 0
      baseTranslateY.value = 0
    })

  const composed = Gesture.Simultaneous(
    doubleTap,
    Gesture.Simultaneous(pinch, pan)
  )

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }))

  return (
    <GestureDetector gesture={composed}>
      <Animated.View className="flex-1" style={animatedStyle}>
        {pipe(
          Option.fromNullable(imageUrl),
          Option.match({
            onNone: () => (
              <View className="flex-1 items-center justify-center">
                <MaterialIcons name="eco" size={64} color="#5B8C5A" />
              </View>
            ),
            onSome: (url) => (
              <Image
                source={{ uri: url }}
                style={{ flex: 1 }}
                contentFit="contain"
              />
            ),
          })
        )}
      </Animated.View>
    </GestureDetector>
  )
}

export function PlantPreviewModal({
  plant,
  ownerName,
  visible,
  onClose,
}: PlantPreviewModalProps) {
  const insets = useSafeAreaInsets()
  const plantOption = Option.fromNullable(plant)

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 bg-black" onPress={onClose}>
        {/* Close button */}
        <Pressable
          className="absolute w-10 h-10 rounded-full bg-black/50 items-center justify-center z-10"
          style={{ top: insets.top + 8, left: 16 }}
          onPress={onClose}
        >
          <MaterialIcons name="close" size={20} color="white" />
        </Pressable>

        {/* Zoomable image — inner Pressable consumes taps to avoid closing modal */}
        <Pressable onPress={() => {}} className="flex-1">
          {pipe(
            plantOption,
            Option.match({
              onNone: () => null,
              onSome: (p) => (
                <ZoomableImage imageUrl={p.imageUrl} visible={visible} />
              ),
            })
          )}
        </Pressable>

        {/* Bottom info panel */}
        {pipe(
          plantOption,
          Option.match({
            onNone: () => null,
            onSome: (p) => (
              <View
                className="absolute bottom-0 left-0 right-0 bg-black/60 px-4"
                style={{ paddingBottom: insets.bottom + 16, paddingTop: 16 }}
              >
                <Text
                  className="text-xl text-white"
                  style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
                >
                  {p.name}
                </Text>
                <Text
                  className="text-sm text-white/70 mt-0.5"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                >
                  {ownerName}
                </Text>
              </View>
            ),
          })
        )}
      </Pressable>
    </Modal>
  )
}
