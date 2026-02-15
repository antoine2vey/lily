import { Stack, useLocalSearchParams } from 'expo-router'
import { FollowersScreen } from 'src/screens/followers'

export default function Followers() {
  const { userId } = useLocalSearchParams<{ userId: string }>()

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FollowersScreen userId={userId} />
    </>
  )
}
