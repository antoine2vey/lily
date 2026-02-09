import { Match, Option, pipe } from 'effect'
import { LinearGradient } from 'expo-linear-gradient'
import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  type LayoutChangeEvent,
  type LayoutRectangle,
  View,
} from 'react-native'
import { Easing } from 'react-native-reanimated'
import { SHIMMER_PRESETS } from 'src/components/ui/shimmer/const'
import type {
  IShimmerEffect,
  IShimmerGroup,
  ShimmerDirection,
  ShimmerPreset,
} from 'src/components/ui/shimmer/Shimmer.types'

export const ShimmerEffect: React.FC<IShimmerEffect> &
  React.FunctionComponent<IShimmerEffect> = memo<IShimmerEffect>(
  ({
    isLoading = true,
    shimmerColors,
    duration = 1500,
    className,
    style,
    variant = 'shimmer',
    direction = 'leftToRight',
    preset = 'dark',
    opacity = 1,
    children,
  }: IShimmerEffect):
    | (React.ReactNode & React.JSX.Element & React.ReactElement)
    | null => {
    const [layout, setLayout] = useState<LayoutRectangle | null>(null)
    const shimmerAnim = useRef<Animated.Value>(new Animated.Value(0)).current
    const pulseAnim = useRef<Animated.Value>(new Animated.Value(0.3)).current
    const fadeAnim = useRef<Animated.Value>(new Animated.Value(0)).current

    const themeColors =
      preset === 'custom' && shimmerColors
        ? shimmerColors
        : SHIMMER_PRESETS[preset].colors

    const backgroundColor =
      preset !== 'custom' ? SHIMMER_PRESETS[preset].backgroundColor : undefined

    const onLayout = useCallback((e: LayoutChangeEvent) => {
      setLayout(e.nativeEvent.layout)
    }, [])

    useEffect(() => {
      if (!layout) return

      if (isLoading) {
        fadeAnim.setValue(0)

        if (variant === 'shimmer') {
          shimmerAnim.setValue(0)
          Animated.loop(
            Animated.timing(shimmerAnim, {
              toValue: 1,
              duration,
              easing: Easing.linear,
              useNativeDriver: true,
            })
          ).start()
        } else {
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, {
                toValue: 1,
                duration: duration / 2,
                easing: Easing.ease,
                useNativeDriver: true,
              }),
              Animated.timing(pulseAnim, {
                toValue: 0.3,
                duration: duration / 2,
                easing: Easing.ease,
                useNativeDriver: true,
              }),
            ])
          ).start()
        }
      } else {
        shimmerAnim.stopAnimation()
        pulseAnim.stopAnimation()
        shimmerAnim.setValue(0)
        pulseAnim.setValue(0.3)

        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start()
      }

      return () => {
        shimmerAnim.stopAnimation()
        pulseAnim.stopAnimation()
      }
    }, [layout, isLoading, duration, variant, shimmerAnim, pulseAnim, fadeAnim])

    const getWaveWidth = () => {
      if (!layout) return 0
      if (direction === 'leftToRight' || direction === 'rightToLeft') {
        return layout.width * 0.5
      }
      return layout.height * 0.5
    }

    const waveWidth = getWaveWidth()

    const getTransform = () => {
      if (!layout) return {}

      if (variant === 'pulse') {
        return { opacity: pulseAnim }
      }

      return pipe(
        Match.value(direction),
        Match.when('leftToRight', () => ({
          transform: [
            {
              translateX: shimmerAnim.interpolate<number>({
                inputRange: [0, 1],
                outputRange: [-waveWidth, layout.width + waveWidth],
              }),
            },
          ],
        })),
        Match.when('rightToLeft', () => ({
          transform: [
            {
              translateX: shimmerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [layout.width + waveWidth, -waveWidth],
              }),
            },
          ],
        })),
        Match.when('topToBottom', () => ({
          transform: [
            {
              translateY: shimmerAnim.interpolate<number>({
                inputRange: [0, 1],
                outputRange: [-waveWidth, layout.height + waveWidth],
              }),
            },
          ],
        })),
        Match.when('bottomToTop', () => ({
          transform: [
            {
              translateY: shimmerAnim.interpolate<number>({
                inputRange: [0, 1],
                outputRange: [layout.height + waveWidth, -waveWidth],
              }),
            },
          ],
        })),
        Match.exhaustive
      )
    }

    return (
      <View
        onLayout={onLayout}
        className={className}
        style={[
          style,
          {
            overflow: 'hidden',
            backgroundColor: isLoading
              ? pipe(
                  Option.fromNullable(backgroundColor),
                  Option.getOrElse(() => style?.backgroundColor)
                )
              : pipe(
                  Option.fromNullable(style?.backgroundColor),
                  Option.getOrElse(() => 'transparent' as string)
                ),
            opacity,
          },
        ]}
      >
        {!isLoading && (
          <Animated.View
            style={{
              opacity: fadeAnim,
            }}
          >
            {children}
          </Animated.View>
        )}
        {isLoading && layout && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              overflow: 'hidden',
            }}
            pointerEvents="none"
          >
            <Animated.View
              style={[
                {
                  width:
                    variant === 'shimmer' &&
                    (direction === 'leftToRight' || direction === 'rightToLeft')
                      ? waveWidth
                      : layout.width,
                  height:
                    variant === 'shimmer' &&
                    (direction === 'topToBottom' || direction === 'bottomToTop')
                      ? waveWidth
                      : layout.height,
                },
                getTransform(),
              ]}
            >
              {variant === 'shimmer' ? (
                <LinearGradient
                  colors={themeColors as [string, string, ...string[]]}
                  start={
                    direction === 'leftToRight' || direction === 'rightToLeft'
                      ? { x: 0, y: 0.5 }
                      : { x: 0.5, y: 0 }
                  }
                  end={
                    direction === 'leftToRight' || direction === 'rightToLeft'
                      ? { x: 1, y: 0.5 }
                      : { x: 0.5, y: 1 }
                  }
                  style={{ flex: 1 }}
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    backgroundColor: themeColors[1],
                  }}
                />
              )}
            </Animated.View>
          </View>
        )}
      </View>
    )
  }
)

export const ShimmerGroup: React.FC<IShimmerGroup> &
  React.FunctionComponent<IShimmerGroup> = memo<IShimmerGroup>(
  ({
    isLoading = true,
    children,
    preset = 'dark',
    duration = 1500,
    direction = 'leftToRight',
    opacity = 1,
  }: IShimmerGroup):
    | (React.JSX.Element & React.ReactNode & React.ReactElement)
    | null => {
    const propagateProps = (children: React.ReactNode): React.ReactNode => {
      return React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) {
          return child
        }

        const childProps = child.props as Record<string, unknown>

        if (child.type === Shimmer || child.type === ShimmerEffect) {
          return React.cloneElement(
            child as React.ReactElement<IShimmerEffect>,
            {
              isLoading,
              preset: pipe(
                Option.fromNullable(
                  childProps.preset as ShimmerPreset | undefined
                ),
                Option.getOrElse(() => preset)
              ),
              duration: pipe(
                Option.fromNullable(childProps.duration as number | undefined),
                Option.getOrElse(() => duration)
              ),
              direction: pipe(
                Option.fromNullable(
                  childProps.direction as ShimmerDirection | undefined
                ),
                Option.getOrElse(() => direction)
              ),
              opacity: pipe(
                Option.fromNullable(childProps.opacity as number | undefined),
                Option.getOrElse(() => opacity)
              ),
            }
          )
        }

        if (childProps?.children) {
          return React.cloneElement(
            child as React.ReactElement<{ children: React.ReactNode }>,
            {
              children: propagateProps(childProps.children as React.ReactNode),
            }
          )
        }

        return child
      })
    }

    return <>{propagateProps(children)}</>
  }
)
export const Shimmer: React.FC<IShimmerEffect> &
  React.FunctionComponent<IShimmerEffect> = memo<IShimmerEffect>(
  (
    props: IShimmerEffect
  ): (React.ReactNode & React.JSX.Element & React.ReactElement) | null => {
    return <ShimmerEffect {...props} />
  }
)
