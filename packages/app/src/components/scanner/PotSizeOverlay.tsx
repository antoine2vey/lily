import { useState } from 'react'
import { Text, View } from 'react-native'
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import type { PotDetection } from 'src/utils/frame-processors/pot-detector'

interface PotSizeOverlayProps {
  /** Current pot detection result (updated from frame processor) */
  readonly detection: SharedValue<PotDetection | null>
  /** Camera preview dimensions for mapping normalized bbox to pixels */
  readonly previewWidth: number
  readonly previewHeight: number
}

/**
 * Renders a bounding box overlay around the detected pot with
 * a size label chip. Smoothly animates position and size changes.
 */
export function PotSizeOverlay({
  detection,
  previewWidth,
  previewHeight,
}: PotSizeOverlayProps) {
  const opacity = useDerivedValue(() =>
    detection.value !== null
      ? withTiming(1, { duration: 200 })
      : withTiming(0, { duration: 300 })
  )

  const boxStyle = useAnimatedStyle(() => {
    const det = detection.value
    if (!det) {
      return { opacity: 0 }
    }

    return {
      opacity: opacity.value,
      left: withSpring(det.bbox.x * previewWidth, { damping: 20 }),
      top: withSpring(det.bbox.y * previewHeight, { damping: 20 }),
      width: withSpring(det.bbox.width * previewWidth, {
        damping: 20,
      }),
      height: withSpring(det.bbox.height * previewHeight, {
        damping: 20,
      }),
    }
  })

  const labelStyle = useAnimatedStyle(() => {
    const det = detection.value
    if (!det) {
      return { opacity: 0 }
    }

    return {
      opacity: opacity.value,
      left: withSpring(
        det.bbox.x * previewWidth + (det.bbox.width * previewWidth) / 2 - 40,
        { damping: 20 }
      ),
      top: withSpring((det.bbox.y + det.bbox.height) * previewHeight + 8, {
        damping: 20,
      }),
    }
  })

  return (
    <>
      {/* Bounding box */}
      <Animated.View
        style={[
          boxStyle,
          {
            position: 'absolute',
            borderWidth: 2,
            borderColor: '#5B8C5A',
            borderStyle: 'dashed',
            borderRadius: 8,
          },
        ]}
        pointerEvents="none"
      >
        {/* Corner markers */}
        <View
          className="absolute -top-0.5 -left-0.5 w-4 h-4"
          style={{
            borderTopWidth: 3,
            borderLeftWidth: 3,
            borderColor: '#5B8C5A',
            borderTopLeftRadius: 4,
          }}
        />
        <View
          className="absolute -top-0.5 -right-0.5 w-4 h-4"
          style={{
            borderTopWidth: 3,
            borderRightWidth: 3,
            borderColor: '#5B8C5A',
            borderTopRightRadius: 4,
          }}
        />
        <View
          className="absolute -bottom-0.5 -left-0.5 w-4 h-4"
          style={{
            borderBottomWidth: 3,
            borderLeftWidth: 3,
            borderColor: '#5B8C5A',
            borderBottomLeftRadius: 4,
          }}
        />
        <View
          className="absolute -bottom-0.5 -right-0.5 w-4 h-4"
          style={{
            borderBottomWidth: 3,
            borderRightWidth: 3,
            borderColor: '#5B8C5A',
            borderBottomRightRadius: 4,
          }}
        />
      </Animated.View>

      {/* Size label chip */}
      <Animated.View
        style={[
          labelStyle,
          {
            position: 'absolute',
            minWidth: 80,
            alignItems: 'center',
          },
        ]}
        pointerEvents="none"
      >
        <PotSizeLabel detection={detection} />
      </Animated.View>
    </>
  )
}

function PotSizeLabel({
  detection,
}: {
  detection: SharedValue<PotDetection | null>
}) {
  const [label, setLabel] = useState<{
    sizeCategory: string
    sizeCm: number
  } | null>(null)

  useAnimatedReaction(
    () => detection.value,
    (det) => {
      runOnJS(setLabel)(
        det ? { sizeCategory: det.sizeCategory, sizeCm: det.sizeCm } : null
      )
    }
  )

  if (!label) return null

  return (
    <View
      className="flex-row items-center rounded-full px-3 py-1"
      style={{ backgroundColor: 'rgba(91, 140, 90, 0.9)' }}
    >
      <Text
        className="text-xs text-white"
        style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
      >
        {label.sizeCategory}
      </Text>
      <Text
        className="text-xs text-white/70 ml-1"
        style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
      >
        ~{String(label.sizeCm)}cm
      </Text>
    </View>
  )
}
