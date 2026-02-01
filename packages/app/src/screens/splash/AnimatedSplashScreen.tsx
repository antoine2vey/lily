import { MaterialIcons } from '@expo/vector-icons'
import * as SplashScreen from 'expo-splash-screen'
import { useCallback, useEffect, useState } from 'react'
import { Animated, Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

interface AnimatedSplashScreenProps {
  children: React.ReactNode
  isReady: boolean
}

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync()

export function AnimatedSplashScreen({
  children,
  isReady,
}: AnimatedSplashScreenProps) {
  const iconColors = useIconColors()
  const [isSplashAnimationComplete, setSplashAnimationComplete] =
    useState(false)
  const fadeAnim = useState(() => new Animated.Value(1))[0]
  const scaleAnim = useState(() => new Animated.Value(1))[0]
  const opacityAnim = useState(() => new Animated.Value(0))[0]

  const onLayoutRootView = useCallback(async () => {
    if (isReady) {
      // Start fade-in animation for content
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start()

      // Start fade-out animation for splash
      await SplashScreen.hideAsync()

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.2,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setSplashAnimationComplete(true)
      })
    }
  }, [isReady, fadeAnim, scaleAnim, opacityAnim])

  useEffect(() => {
    onLayoutRootView()
  }, [onLayoutRootView])

  if (!isSplashAnimationComplete) {
    return (
      <View className="flex-1">
        {/* Main content with fade-in */}
        <Animated.View style={{ flex: 1, opacity: opacityAnim }}>
          {children}
        </Animated.View>

        {/* Animated splash overlay */}
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          }}
          pointerEvents="none"
        >
          <View className="flex-1 items-center justify-center bg-primary">
            {/* Logo Container */}
            <View
              className="w-[100px] h-[100px] rounded-3xl bg-white items-center justify-center mb-6"
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              <MaterialIcons name="eco" size={56} color={iconColors.primary} />
            </View>

            {/* App Name */}
            <Text className="text-[32px] font-bold text-white mb-2">Lily</Text>

            {/* Tagline */}
            <Text
              className="text-base font-regular"
              style={{ color: 'rgba(255, 255, 255, 0.85)' }}
            >
              Your plants, thriving
            </Text>
          </View>
        </Animated.View>
      </View>
    )
  }

  return <>{children}</>
}
