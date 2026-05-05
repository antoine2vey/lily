import {
  isLiquidGlassSupported,
  LiquidGlassContainerView,
  LiquidGlassView,
} from '@callstack/liquid-glass'
import { Array } from 'effect'
import type { Href } from 'expo-router'
import { router, usePathname } from 'expo-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, useWindowDimensions, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { StandaloneTabBarProps } from '@/components/BottomTabBar'
import {
  BottomTabBar,
  getActiveIndex,
  getTabBadgeCount,
  LEFT_ROUTES,
  RIGHT_ROUTES,
  type TAB_ROUTES,
  TabItem,
} from '@/components/BottomTabBar'

// Liquid glass on iOS 26+ uses accessibility containment that hides
// the rest of the app's view hierarchy from XCTest / VoiceOver. That
// breaks Maestro-driven flows on every screen inside the tabs layout.
// Screenshot/test builds set EXPO_PUBLIC_E2E=1 at build time to force
// the plain BottomTabBar fallback, restoring a traversable a11y tree.
const isE2EBuild = process.env.EXPO_PUBLIC_E2E === '1'
const isSupported =
  !isE2EBuild && isLiquidGlassSupported && Platform.OS === 'ios'

const BAR_HEIGHT = 64
const BAR_MARGIN = 20
const BAR_PADDING = 8
const TAB_COUNT = 6
const BUBBLE_WIDTH = 60
const BUBBLE_HEIGHT = 72
const TIMING_CONFIG = { duration: 300 }

const GlassView = isSupported ? LiquidGlassView : View
const GlassContainerView = isSupported ? LiquidGlassContainerView : View

export function LiquidGlassTabBar({
  onFabPress,
  careBadgeCount = 0,
}: StandaloneTabBarProps) {
  const { width: screenWidth } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const pathname = usePathname()
  const { t } = useTranslation('common')
  const activeIndex = getActiveIndex(pathname)

  const barWidth = screenWidth - BAR_MARGIN * 2
  const tabWidth = (barWidth - BAR_PADDING * 2) / TAB_COUNT
  const slot = activeIndex >= 2 ? activeIndex + 1 : activeIndex
  const targetLeft =
    BAR_MARGIN + BAR_PADDING + slot * tabWidth + tabWidth / 2 - BUBBLE_WIDTH / 2

  const bubbleLeft = useSharedValue(targetLeft)

  useEffect(() => {
    bubbleLeft.value = withTiming(targetLeft, TIMING_CONFIG)
  }, [targetLeft, bubbleLeft])

  const bubbleAnimStyle = useAnimatedStyle(() => ({
    left: bubbleLeft.value,
  }))

  if (!isSupported) {
    return (
      <BottomTabBar onFabPress={onFabPress} careBadgeCount={careBadgeCount} />
    )
  }

  const totalHeight = BUBBLE_HEIGHT + insets.bottom + 8

  const renderTab = (route: (typeof TAB_ROUTES)[number], index: number) => {
    const isFocused = activeIndex === index
    return (
      <TabItem
        key={route.name}
        testID={`tab-${route.name}`}
        iconName={isFocused ? route.icon.active : route.icon.inactive}
        label={t(route.labelKey)}
        isFocused={isFocused}
        badgeCount={getTabBadgeCount(route, careBadgeCount)}
        onPress={() => {
          if (!isFocused) {
            router.navigate(route.path as Href)
          }
        }}
      />
    )
  }

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: totalHeight,
      }}
      pointerEvents="box-none"
    >
      <GlassContainerView
        spacing={20}
        style={{
          position: 'absolute',
          bottom: insets.bottom + 8,
          left: 0,
          right: 0,
          height: BUBBLE_HEIGHT,
          justifyContent: 'flex-end',
        }}
      >
        {/* Active tab bubble — merges with bar */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              bottom: 0,
              width: BUBBLE_WIDTH,
              height: BUBBLE_HEIGHT,
              zIndex: 1,
            },
            bubbleAnimStyle,
          ]}
        >
          <GlassView
            interactive={false}
            style={{
              flex: 1,
              borderRadius: BUBBLE_WIDTH / 2,
            }}
          />
        </Animated.View>

        {/* Main bar pill with tabs inside */}
        <GlassView
          interactive={false}
          style={{
            height: BAR_HEIGHT,
            marginHorizontal: BAR_MARGIN,
            borderRadius: BAR_HEIGHT / 2,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: BAR_PADDING,
          }}
        >
          {Array.map(LEFT_ROUTES, (route, i) => renderTab(route, i))}
          <TabItem
            key="add"
            iconName="add"
            label={t('tabs.add')}
            isFocused={false}
            badgeCount={0}
            onPress={onFabPress}
          />
          {Array.map(RIGHT_ROUTES, (route, i) => renderTab(route, i + 2))}
        </GlassView>
      </GlassContainerView>
    </View>
  )
}
