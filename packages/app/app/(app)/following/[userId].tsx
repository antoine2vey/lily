import { Stack, useLocalSearchParams } from 'expo-router'
import { FollowingScreen } from 'src/screens/following'

export default function Following() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const actualUserId = userId === 'me' ? undefined : userId

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FollowingScreen userId={actualUserId} />
    </>
  )
}
