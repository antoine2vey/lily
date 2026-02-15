import { Stack, useLocalSearchParams } from 'expo-router'
import { PublicProfileScreen } from 'src/screens/public-profile'

export default function PublicProfile() {
  const { userId } = useLocalSearchParams<{ userId: string }>()

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PublicProfileScreen userId={userId} />
    </>
  )
}
