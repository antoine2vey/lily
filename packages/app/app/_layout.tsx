// Polyfills must be imported first
import 'src/polyfills'

import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Match, pipe } from 'effect'
import { Slot, SplashScreen, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Toaster } from 'sonner-native'
import { AuthProvider, useAuth } from 'src/contexts/AuthContext'
import { RevenueCatProvider } from 'src/contexts/RevenueCatContext'
import { AnimatedSplashScreen } from 'src/screens/splash'
import * as RevenueCatService from 'src/services/revenuecat'
import { setupNotificationListeners } from 'src/utils/notifications'
import 'src/global.css'

// Prevent the splash screen from auto-hiding before fonts are loaded
SplashScreen.preventAutoHideAsync()

// Initialize RevenueCat SDK
RevenueCatService.initialize()

const queryClient = new QueryClient()

interface RootLayoutNavProps {
  fontsLoaded: boolean
}

function RootLayoutNav({ fontsLoaded }: RootLayoutNavProps) {
  const { state } = useAuth()
  const router = useRouter()
  const [isReady, setIsReady] = useState(false)

  // Show loading state while checking auth or fonts
  const isLoading = pipe(
    Match.value(state),
    Match.when({ _tag: 'Loading' }, () => true),
    Match.orElse(() => false)
  )

  const showContent = fontsLoaded && !isLoading

  // Set up notification listeners and RevenueCat identity when authenticated
  useEffect(() => {
    const isAuthenticated = pipe(
      Match.value(state),
      Match.when({ _tag: 'Authenticated' }, () => true),
      Match.orElse(() => false)
    )

    if (isAuthenticated && state._tag === 'Authenticated') {
      RevenueCatService.identify(state.user.id)
      const cleanup = setupNotificationListeners(router)
      return cleanup
    }
  }, [state, router])

  useEffect(() => {
    if (showContent) {
      // Small delay to ensure smooth transition
      const timeout = setTimeout(() => setIsReady(true), 100)
      return () => clearTimeout(timeout)
    }
  }, [showContent])

  return (
    <AnimatedSplashScreen isReady={isReady}>
      {showContent ? (
        <Slot />
      ) : (
        <View className="flex-1 bg-background-light dark:bg-background-dark items-center justify-center">
          {/* Loading indicator could go here */}
        </View>
      )}
    </AnimatedSplashScreen>
  )
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  })

  useEffect(() => {
    if (fontsLoaded || fontError) {
      // Don't hide splash screen here - AnimatedSplashScreen handles it
    }
  }, [fontsLoaded, fontError])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RevenueCatProvider>
            <StatusBar style="auto" />
            <RootLayoutNav fontsLoaded={fontsLoaded || !!fontError} />
            <Toaster />
          </RevenueCatProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}
