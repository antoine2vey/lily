import { Stack } from 'expo-router'
import { UserSearchScreen } from '@/screens/user-search'

export default function UserSearch() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <UserSearchScreen />
    </>
  )
}
