import { Match, pipe } from 'effect'
import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '@/contexts/AuthContext'
import { useOnboardingComplete } from '@/hooks/useOnboardingComplete'
import { useWelcomeSeen } from '@/hooks/useWelcomeSeen'
import { iconColorsLight as iconColors } from '@/theme'

export default function Index() {
  const { state } = useAuth()
  const { isComplete: hasCompletedOnboarding, isLoading: isLoadingOnboarding } =
    useOnboardingComplete()
  const { hasSeen: hasSeenWelcome, isLoading: isLoadingWelcome } =
    useWelcomeSeen()

  // Show loading while checking auth or onboarding status
  const isAuthenticatedAndLoadingOnboarding =
    state._tag === 'Authenticated' && isLoadingOnboarding

  if (isAuthenticatedAndLoadingOnboarding) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={iconColors.primary} />
      </View>
    )
  }

  return pipe(
    Match.value(state),
    Match.when({ _tag: 'Loading' }, () => (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={iconColors.primary} />
      </View>
    )),
    Match.when({ _tag: 'Authenticated' }, () => {
      // Check if user needs onboarding
      if (!hasCompletedOnboarding) {
        return <Redirect href="/(auth)/onboarding" />
      }
      return <Redirect href="/(app)/(tabs)" />
    }),
    Match.when({ _tag: 'NeedsUsername' }, () => (
      <Redirect href="/(auth)/username" />
    )),
    Match.when({ _tag: 'Unauthenticated' }, () => {
      if (isLoadingWelcome) {
        return (
          <View className="flex-1 bg-background items-center justify-center">
            <ActivityIndicator size="large" color={iconColors.primary} />
          </View>
        )
      }
      if (!hasSeenWelcome) {
        return <Redirect href="/(auth)/welcome" />
      }
      return <Redirect href="/(auth)/login" />
    }),
    Match.exhaustive
  )
}
