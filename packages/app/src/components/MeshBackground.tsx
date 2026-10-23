import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { AnimatedMeshGradient } from '@/components/ui/organisms/mesh-gradient'
import type { IMeshGradientColor } from '@/components/ui/organisms/mesh-gradient/types'
import { useThemeContext } from '@/contexts/ThemeContext'

const LIGHT_COLORS = [
  { r: 0.36, g: 0.55, b: 0.35 },
  { r: 0.42, g: 0.61, b: 0.42 },
  { r: 0.22, g: 0.48, b: 0.45 },
  { r: 0.29, g: 0.49, b: 0.29 },
]

const DARK_COLORS = [
  { r: 0.12, g: 0.22, b: 0.14 },
  { r: 0.16, g: 0.28, b: 0.18 },
  { r: 0.08, g: 0.2, b: 0.22 },
  { r: 0.1, g: 0.18, b: 0.12 },
]

/**
 * A flat color close to the mesh's average, for navigator backgrounds that
 * show for a frame during route transitions instead of the light app color.
 */
export const MESH_BASE_COLOR = { light: '#528761', dark: '#1E382A' } as const

/** Alternate mesh colors that fade in over the default green ones. */
export interface MeshTint {
  /** Changing the id crossfades to the new tint. */
  id: string
  light: IMeshGradientColor[]
  dark: IMeshGradientColor[]
}

interface MeshBackgroundProps {
  children: ReactNode
  tint?: MeshTint | undefined
}

const TINT_FADE_MS = 700

export function MeshBackground({ children, tint }: MeshBackgroundProps) {
  const { isDark } = useThemeContext()

  return (
    <View className="flex-1">
      <AnimatedMeshGradient
        colors={isDark ? DARK_COLORS : LIGHT_COLORS}
        speed={1}
        noise={0.3}
        blur={0.5}
        contrast={1.1}
        style={StyleSheet.absoluteFill}
      />
      {tint && (
        <Animated.View
          key={tint.id}
          entering={FadeIn.duration(TINT_FADE_MS)}
          exiting={FadeOut.duration(TINT_FADE_MS)}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        >
          <AnimatedMeshGradient
            colors={isDark ? tint.dark : tint.light}
            speed={1}
            noise={0.3}
            blur={0.5}
            contrast={1.1}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
      {children}
    </View>
  )
}
