import { Canvas, Fill, Shader, Skia, vec } from '@shopify/react-native-skia'
import type React from 'react'
import { memo, useMemo } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated'
import { SHADER as MESH_GRADIENT_SHADER } from './conf'
import { DEFAULT_INITIAL_COLORS } from './const'
import type { IAnimatedMeshGradient, IMeshGradientColor } from './types'

export const AnimatedMeshGradient: React.FC<IAnimatedMeshGradient> &
  React.FunctionComponent<IAnimatedMeshGradient> = memo<IAnimatedMeshGradient>(
  ({
    colors = DEFAULT_INITIAL_COLORS,
    speed = 1,
    noise = 0.15,
    blur = 0.4,
    contrast = 1,
    animated = true,
    style,
    width: paramsWidth,
    height: paramsHeight,
  }: React.ComponentProps<typeof AnimatedMeshGradient>): React.ReactNode &
    React.JSX.Element &
    React.ReactElement => {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions()
    const width = paramsWidth ?? screenWidth
    const height = paramsHeight ?? screenHeight

    const time = useSharedValue<number>(0)

    useFrameCallback((frameInfo) => {
      if (animated && frameInfo.timeSincePreviousFrame !== null) {
        time.value += (frameInfo.timeSincePreviousFrame / 1000) * speed
      }
    }, animated)

    const safeColors = useMemo<
      readonly [
        IMeshGradientColor,
        IMeshGradientColor,
        IMeshGradientColor,
        IMeshGradientColor,
      ]
    >(() => {
      const result: IMeshGradientColor[] = [...colors]
      while (result.length < 4) {
        const idx = result.length % DEFAULT_INITIAL_COLORS.length
        // biome-ignore lint/style/noNonNullAssertion: modulo keeps idx in bounds of non-empty DEFAULT_INITIAL_COLORS
        const fallback = DEFAULT_INITIAL_COLORS[idx]!
        result.push(fallback)
      }
      // biome-ignore lint/style/noNonNullAssertion: loop above guarantees result.length >= 4
      return [result[0]!, result[1]!, result[2]!, result[3]!] as const
    }, [colors])

    const shader = useMemo(() => {
      return Skia.RuntimeEffect.Make(MESH_GRADIENT_SHADER)
    }, [])

    const uniforms = useDerivedValue(() => {
      return {
        resolution: vec(width, height),
        time: time.value,
        noise: Math.max(0, Math.min(1, noise)),
        blur: Math.max(0, Math.min(1, blur)),
        contrast: Math.max(0, Math.min(2, contrast)),
        color1: [safeColors[0].r, safeColors[0].g, safeColors[0].b, 1],
        color2: [safeColors[1].r, safeColors[1].g, safeColors[1].b, 1],
        color3: [safeColors[2].r, safeColors[2].g, safeColors[2].b, 1],
        color4: [safeColors[3].r, safeColors[3].g, safeColors[3].b, 1],
      }
    }, [width, height, noise, blur, contrast, safeColors, time])

    if (!shader) {
      return <View style={[styles.container, style, { width, height }]} />
    }

    return (
      <View style={[styles.container, style, { width, height }]}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill>
            <Shader source={shader} uniforms={uniforms} />
          </Fill>
        </Canvas>
      </View>
    )
  }
)

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
})

export default memo<
  React.FC<IAnimatedMeshGradient> &
    React.FunctionComponent<IAnimatedMeshGradient>
>(AnimatedMeshGradient)
