import { Stack } from 'expo-router'
import { DelegationListScreen } from 'src/screens/delegation-list'

export default function Delegations() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DelegationListScreen />
    </>
  )
}
