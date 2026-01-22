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
import { Toast } from 'src/components/Toast'
import { AuthProvider, useAuth } from 'src/contexts/AuthContext'
import { ToastProvider } from 'src/contexts/ToastContext'
import { AnimatedSplashScreen } from 'src/screens/splash'
import { setupNotificationListeners } from 'src/utils/notifications'
import 'src/global.css'

// Prevent the splash screen from auto-hiding before fonts are loaded
SplashScreen.preventAutoHideAsync()

const queryClient = new QueryClient()

function RootLayoutNav() {
  const { state } = useAuth()
  const router = useRouter()
  const [isReady, setIsReady] = useState(false)

  // Show loading state while checking auth
  const isLoading = pipe(
    Match.value(state),
    Match.when({ _tag: 'Loading' }, () => true),
    Match.orElse(() => false)
  )

  // Set up notification listeners when authenticated
  useEffect(() => {
    const isAuthenticated = pipe(
      Match.value(state),
      Match.when({ _tag: 'Authenticated' }, () => true),
      Match.orElse(() => false)
    )

    if (isAuthenticated) {
      const cleanup = setupNotificationListeners(router)
      return cleanup
    }
  }, [state, router])

  useEffect(() => {
    if (!isLoading) {
      // Small delay to ensure smooth transition
      const timeout = setTimeout(() => setIsReady(true), 100)
      return () => clearTimeout(timeout)
    }
  }, [isLoading])

  return (
    <AnimatedSplashScreen isReady={isReady}>
      {isLoading ? (
        <View className="flex-1 bg-background-light dark:bg-background-dark items-center justify-center">
          {/* Loading indicator could go here */}
        </View>
      ) : (
        <Slot />
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

  if (!fontsLoaded && !fontError) {
    return null
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <StatusBar style="auto" />
          <RootLayoutNav />
          <Toast />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
