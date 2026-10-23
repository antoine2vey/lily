import { Match, pipe } from 'effect'
import { Redirect } from 'expo-router'
import { View } from 'react-native'
import { MeshBackground } from '@/components'
import { useAuth } from '@/contexts/AuthContext'
import { useOnboardingComplete } from '@/hooks/useOnboardingComplete'
import { useWelcomeSeen } from '@/hooks/useWelcomeSeen'

// Shown for a moment while auth and onboarding state load. Login, welcome and
// onboarding all sit on the mesh, so the gate does too: a plain background
// here flashed white between the magic-link screen and onboarding.
function GateLoading() {
  return (
    <MeshBackground>
      <View className="flex-1" />
    </MeshBackground>
  )
}

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
    return <GateLoading />
  }

  return pipe(
    Match.value(state),
    Match.when({ _tag: 'Loading' }, () => <GateLoading />),
    Match.when({ _tag: 'Authenticated' }, () => {
      // Dev builds replay onboarding on every launch so it can be debugged
      if (__DEV__ || !hasCompletedOnboarding) {
        return <Redirect href="/(auth)/onboarding" />
      }
      return <Redirect href="/(app)/(tabs)" />
    }),
    Match.when({ _tag: 'NeedsUsername' }, () => (
      <Redirect href="/(auth)/username" />
    )),
    Match.when({ _tag: 'Unauthenticated' }, () => {
      if (isLoadingWelcome) {
        return <GateLoading />
      }
      // Dev builds replay the welcome carousel on every signed-out visit so it
      // can be debugged
      if (__DEV__ || !hasSeenWelcome) {
        return <Redirect href="/(auth)/welcome" />
      }
      return <Redirect href="/(auth)/login" />
    }),
    Match.exhaustive
  )
}
