import { Match, pipe } from 'effect'
import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from 'src/contexts/AuthContext'
import { useOnboardingComplete } from 'src/hooks/useOnboardingComplete'
import { iconColorsLight as iconColors } from 'src/theme'

export default function Index() {
  const { state } = useAuth()
  const { isComplete: hasCompletedOnboarding, isLoading: isLoadingOnboarding } =
    useOnboardingComplete()

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
    Match.when({ _tag: 'Unauthenticated' }, () => (
      <Redirect href="/(auth)/login" />
    )),
    Match.exhaustive
  )
}
