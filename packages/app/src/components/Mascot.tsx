import {
  Canvas,
  Group,
  Image,
  Mask,
  rect,
  useVideo,
} from '@shopify/react-native-skia'
import { Asset } from 'expo-asset'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { type MascotAnimation, mascotClips } from '@/assets/mascot'

interface MascotProps {
  animation: MascotAnimation
  size?: number
  loop?: boolean
}

/**
 * Local file URI of a clip, reloaded whenever `animation` changes. expo-asset's
 * `useAssets` loads once on mount and ignores later changes. The previous URI
 * stays until the new one is ready, so the last frame holds instead of blanking.
 */
function useClipUri(animation: MascotAnimation): string | null {
  const [uri, setUri] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Asset.fromModule(mascotClips[animation])
      .downloadAsync()
      .then((asset) => {
        if (!cancelled) setUri(asset.localUri)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [animation])

  return uri
}

// Scaling the frame blends the mask's first row with the color half's last
// row (Masko's light checkerboard), which drew a faint line across the top.
// The mascot never reaches the top of its frame, so the mask skips that strip.
const SEAM_INSET = 2

// The clip is twice as tall as it is wide: color on top, alpha mask below.
// The mask half, shifted up over the color half, becomes a luminance mask, so
// the mascot is transparent on both platforms without an alpha video codec.
export function Mascot({ animation, size = 200, loop = true }: MascotProps) {
  const uri = useClipUri(animation)
  const { currentFrame } = useVideo(uri, { looping: loop })

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Canvas style={{ width: size, height: size }}>
        <Mask
          mode="luminance"
          mask={
            <Group clip={rect(0, SEAM_INSET, size, size - SEAM_INSET)}>
              <Group transform={[{ translateY: -size }]}>
                <Image
                  image={currentFrame}
                  x={0}
                  y={0}
                  width={size}
                  height={size * 2}
                  fit="fill"
                />
              </Group>
            </Group>
          }
        >
          <Image
            image={currentFrame}
            x={0}
            y={0}
            width={size}
            height={size * 2}
            fit="fill"
          />
        </Mask>
      </Canvas>
    </View>
  )
}
