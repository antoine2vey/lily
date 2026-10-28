import { Match, Option, pipe } from 'effect'
import { Redirect } from 'expo-router'
import { View } from 'react-native'
import { MeshBackground } from '@/components'
import { useAuth } from '@/contexts/AuthContext'
import { useOnboardingComplete } from '@/hooks/useOnboardingComplete'
import { signedOutRoute, useWelcomeSeen } from '@/hooks/useWelcomeSeen'
import { joinRoute, usePendingJoin } from '@/utils/canopy-invite-token'

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
  const pendingJoin = usePendingJoin()

  // Show loading while checking auth, onboarding status, or an invite
  // stashed before sign-in
  const isAuthenticatedAndLoadingGate =
    state._tag === 'Authenticated' &&
    (isLoadingOnboarding || pendingJoin._tag === 'Loading')

  if (isAuthenticatedAndLoadingGate) {
    return <GateLoading />
  }

  return pipe(
    Match.value(state),
    Match.when({ _tag: 'Loading' }, () => <GateLoading />),
    Match.when({ _tag: 'Authenticated' }, () => {
      if (!hasCompletedOnboarding) {
        return <Redirect href="/(auth)/onboarding" />
      }
      return pipe(
        pendingJoin._tag === 'Loaded' ? pendingJoin.token : Option.none(),
        Option.match({
          onNone: () => <Redirect href="/(app)/(tabs)" />,
          onSome: (token) => <Redirect href={joinRoute(token)} />,
        })
      )
    }),
    Match.when({ _tag: 'NeedsUsername' }, () => (
      <Redirect href="/(auth)/username" />
    )),
    Match.when({ _tag: 'Unauthenticated' }, () => {
      if (isLoadingWelcome) {
        return <GateLoading />
      }
      return <Redirect href={signedOutRoute(hasSeenWelcome ?? false)} />
    }),
    Match.exhaustive
  )
}
