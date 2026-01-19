import { Match, pipe } from 'effect'
import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from 'src/contexts/AuthContext'
import { colors } from 'src/theme'

export default function Index() {
  const { state } = useAuth()

  return pipe(
    Match.value(state),
    Match.when({ _tag: 'Loading' }, () => (
      <View className="flex-1 bg-background-light dark:bg-background-dark items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )),
    Match.when({ _tag: 'Authenticated' }, () => <Redirect href="/(app)" />),
    Match.when({ _tag: 'NeedsUsername' }, () => (
      <Redirect href="/(auth)/username" />
    )),
    Match.when({ _tag: 'Unauthenticated' }, () => (
      <Redirect href="/(auth)/login" />
    )),
    Match.exhaustive
  )
}
