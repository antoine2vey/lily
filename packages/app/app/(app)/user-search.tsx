import { Stack } from 'expo-router'
import { UserSearchScreen } from 'src/screens/user-search'

export default function UserSearch() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <UserSearchScreen />
    </>
  )
}
