import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { AnimatedMeshGradient } from 'src/components/ui/organisms/mesh-gradient'
import { useThemeContext } from 'src/contexts/ThemeContext'

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

interface MeshBackgroundProps {
  children: ReactNode
}

export function MeshBackground({ children }: MeshBackgroundProps) {
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
      {children}
    </View>
  )
}
