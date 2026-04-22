// Polyfills must be imported first
import '@/polyfills'
// Sentry must be initialized before Sentry.wrap() is called
import '@/sentry'

// Import from the family-specific path (not the barrel) — this
// resolves to Expo's wrapped MaterialIcons class which attaches a
// static `.font` property. `MaterialIcons.font` is `{ material: <asset> }`.
// Matches the font-family name the Icon component uses internally
// (`createIconSet(glyphMap, 'material', font)`), which is what must
// be registered with expo-font for glyphs to render in release builds.
// See: https://docs.expo.dev/develop/user-interface/fonts/
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  useFonts,
} from '@expo-google-fonts/space-grotesk'
import * as Sentry from '@sentry/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Match, pipe } from 'effect'
import { Slot, SplashScreen, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Toaster } from 'sonner-native'
import { AchievementUnlockedModal } from '@/components/AchievementUnlockedModal'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { LocalizationProvider } from '@/contexts/LocalizationContext'
import { RevenueCatProvider } from '@/contexts/RevenueCatContext'
import { ThemeProvider, useThemeContext } from '@/contexts/ThemeContext'
import '@/global.css'
import { useAchievementNotifications } from '@/hooks/useAchievementNotifications'
import { useAppStateSync } from '@/hooks/useAppStateSync'
import { useOTAUpdates } from '@/hooks/useOTAUpdates'
import '@/i18n'
import * as RevenueCatService from '@/services/revenuecat'
import { setupNotificationListeners } from '@/utils/notifications'

// RevenueCat service is now initialized lazily in RevenueCatProvider

// Prevent the splash screen from auto-hiding before fonts are loaded
SplashScreen.preventAutoHideAsync()

// Note: RevenueCat SDK initialization moved to RevenueCatProvider to avoid double initialization

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on 401 errors - let apiEffectRunner handle token refresh
        const msg = error instanceof Error ? error.message : String(error)
        if (msg.includes('401') || msg.includes('Unauthorized')) {
          return false
        }
        return failureCount < 3
      },
    },
    mutations: {
      retry: (failureCount, error) => {
        // Don't retry on 401 errors for mutations either
        const msg = error instanceof Error ? error.message : String(error)
        if (msg.includes('401') || msg.includes('Unauthorized')) {
          return false
        }
        return failureCount < 3
      },
    },
  },
})

interface RootLayoutNavProps {
  fontsLoaded: boolean
}

function RootLayoutNav({ fontsLoaded }: RootLayoutNavProps) {
  const { state } = useAuth()
  const router = useRouter()

  // Show loading state while checking auth or fonts
  const isLoading = pipe(
    Match.value(state),
    Match.when({ _tag: 'Loading' }, () => true),
    Match.orElse(() => false)
  )

  const showContent = fontsLoaded && !isLoading

  // Check if user is authenticated for hooks that need it
  const isAuthenticated = pipe(
    Match.value(state),
    Match.when({ _tag: 'Authenticated' }, () => true),
    Match.orElse(() => false)
  )

  // Detect newly unlocked achievements and show celebration modal
  const { currentAchievement, dismiss } =
    useAchievementNotifications(isAuthenticated)

  // Add app state sync for subscription (syncs when app returns to foreground)
  useAppStateSync(isAuthenticated)

  // Check for OTA updates on foreground resume
  useOTAUpdates()

  // Set up notification listeners and RevenueCat identity when authenticated
  useEffect(() => {
    if (isAuthenticated && state._tag === 'Authenticated') {
      RevenueCatService.identify(state.user.id)
      const cleanup = setupNotificationListeners(router)
      return cleanup
    }
    return undefined
  }, [state, router, isAuthenticated])

  // Hide native splash screen once content is ready
  useEffect(() => {
    if (showContent) {
      SplashScreen.hideAsync()
    }
  }, [showContent])

  if (!showContent) {
    return (
      <View className="flex-1 bg-background-light dark:bg-background-dark" />
    )
  }

  return (
    <>
      <Slot />
      <AchievementUnlockedModal
        visible={!!currentAchievement}
        achievement={currentAchievement}
        onClose={dismiss}
      />
    </>
  )
}

export default Sentry.wrap(function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ...MaterialIcons.font,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  })

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LocalizationProvider>
            <AuthProvider>
              <RevenueCatProvider>
                <ThemedStatusBar />
                <RootLayoutNav fontsLoaded={fontsLoaded || !!fontError} />
                <Toaster />
              </RevenueCatProvider>
            </AuthProvider>
          </LocalizationProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
})

function ThemedStatusBar() {
  const { isDark } = useThemeContext()
  return <StatusBar style={isDark ? 'light' : 'dark'} />
}
