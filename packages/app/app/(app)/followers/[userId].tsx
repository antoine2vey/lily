import { Stack, useLocalSearchParams } from 'expo-router'
import { FollowersScreen } from '@/screens/followers'

export default function Followers() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const actualUserId = userId === 'me' ? undefined : userId

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FollowersScreen userId={actualUserId} />
    </>
  )
}
